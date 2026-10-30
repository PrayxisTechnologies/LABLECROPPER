"""SKU extraction and picklist CSV generation service."""

import csv
import functools
import io
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from app.schemas.processing import (
    ExtractedSKU,
    MainSkuSummary,
    PicklistItem,
    SubSkuSummary,
)

# Common product/color keywords used for classifying parent Main SKUs
COLOR_KEYWORDS = [
    "BROWN", "GREEN", "BLACK", "BLUE", "RED", "PINK", "WHITE",
    "YELLOW", "GREY", "GRAY", "ORANGE", "PURPLE", "GOLD", "SILVER",
    "MAROON", "NAVY", "BEIGE", "KHAKI", "PEACH", "TEAL", "MAGENTA"
]

COLOR_PATTERNS = {
    c: re.compile(r"(?<![A-Za-z0-9])" + c + r"(?![A-Za-z0-9])")
    for c in COLOR_KEYWORDS
}

@functools.lru_cache(maxsize=1024)
def _compile_boundary_pattern(phrase_str: str) -> re.Pattern:
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(phrase_str) + r"(?![A-Za-z0-9])")


def get_main_sku_group(
    sku: str,
    sku_engine: Optional[Any] = None,
    user_skus: Optional[List[Dict]] = None,
    full_text: str = "",
    smart_sku_detection: bool = False,
) -> str:
    """Extract parent/main SKU category.
    - User's saved catalog SKUs are ALWAYS given 100% top priority.
    - If smart_sku_detection is False (default): Unrecognized variants stay strictly in UNKNOWN. System never guesses or invents pseudo-SKUs.
    - If smart_sku_detection is True: Clusters by letter/number patterns and distinguishing section keywords (e.g. GREEN, BLUE).
    """
    if not sku:
        return "UNKNOWN"

    sku_clean = sku.strip()

    # 1. First Priority: Check if SKUIntelligenceEngine matches a saved SKU in user's personal database
    if sku_engine:
        try:
            matched = sku_engine.find_parent_sku(sku_clean, full_text=full_text)
            if matched and matched.upper() not in ("OTHER", "UNMATCHED"):
                return matched.strip().upper()
        except Exception:
            pass

    # 2. Second Priority: Match against user's saved SKUs (canonical codes & keywords sorted longest first)
    if user_skus:
        sku_clean_upper = sku_clean.upper()
        all_user_phrases: List[Tuple[str, str]] = []
        for u in user_skus:
            if not u.get("is_active", True):
                continue
            code_upper = (u.get("sku_code") or "").strip().upper()
            if not code_upper or code_upper in ("UNKNOWN", "UNMATCHED"):
                continue

            all_user_phrases.append((code_upper, code_upper))
            for kw in u.get("keywords", []) + u.get("aliases", []):
                kw_str = str(kw).strip().upper()
                if kw_str and kw_str not in ("UNKNOWN", "UNMATCHED") and (kw_str, code_upper) not in all_user_phrases:
                    all_user_phrases.append((kw_str, code_upper))

        all_user_phrases.sort(
            key=lambda x: (len(x[0].split()), len(x[0])),
            reverse=True,
        )

        sku_clean_subtokens = set(t.upper() for t in re.findall(r"[A-Za-z]+|\d+", sku_clean))
        sku_clean_compact = re.sub(r"[\s_\-\.\/]+", "", sku_clean_upper)

        for phrase_str, code_upper in all_user_phrases:
            pattern = _compile_boundary_pattern(phrase_str)
            compact_phrase = phrase_str.replace(" ", "")
            if phrase_str == sku_clean_upper or pattern.search(sku_clean_upper):
                return code_upper
            if phrase_str in sku_clean_subtokens or compact_phrase in sku_clean_subtokens:
                return code_upper
            if len(compact_phrase) >= 4 and compact_phrase in sku_clean_compact:
                return code_upper
            if full_text and (pattern.search(full_text.upper()) or (len(compact_phrase) >= 4 and compact_phrase in full_text.upper())):
                return code_upper

    # If Smart SKU Detection is NOT turned on:
    # STRICT USER CONTROL: System NEVER invents or alters SKUs on its own!
    # Unmatched labels must stay strictly in UNKNOWN.
    if not smart_sku_detection:
        return "UNKNOWN"

    # 3. Third Priority (ONLY when smart_sku_detection is TRUE):
    # Sort letter & number wise and identify distinct section keywords (e.g. GREEN, BLUE, BROWN, etc.)
    sku_upper = sku_clean.upper()
    for sec_kw in COLOR_KEYWORDS:
        pattern = COLOR_PATTERNS.get(sec_kw) or _compile_boundary_pattern(sec_kw)
        if pattern.search(sku_upper) or (len(sec_kw) >= 4 and sec_kw in sku_upper):
            # Check for common prefix e.g. 'RSPK GREEN 001' -> 'RSPK GREEN'
            prefix_match = re.match(r"^([A-Za-z0-9]+)[\s_\-]+(" + sec_kw + r")\b", sku_upper)
            if prefix_match:
                return f"{prefix_match.group(1)} {sec_kw}".upper()
            return sec_kw

    return "UNKNOWN"


# Regex patterns for Meesho label line items precompiled for maximum speed
COMPILED_SKU_PATTERNS = [
    re.compile(r"\bSKU\s*(?:Code|Name|ID|No)?\s*[:\-#]\s*([A-Za-z0-9_\-\.\/]+)", re.I),
    re.compile(r"\bItem\s*(?:Code|ID|Name)?\s*[:\-#]\s*([A-Za-z0-9_\-\.\/]+)", re.I),
    re.compile(r"\bProduct\s*(?:Code|ID)?\s*[:\-#]\s*([A-Za-z0-9_\-\.\/]+)", re.I),
]

COMPILED_QTY_PATTERNS = [
    re.compile(r"\b(?:Qty|Quantity)\s*[:\-#]\s*(\d+)", re.I),
    re.compile(r"\bQ\s*[:\-]\s*(\d+)", re.I),
]

COMPILED_ORDER_PATTERNS = [
    re.compile(r"\b(?:Sub\s*Order\s*No|Suborder\s*ID|Suborder\s*No)\s*[:\-#]\s*([A-Za-z0-9_\-]+)", re.I),
    re.compile(r"\b(?:Order\s*No|Order\s*ID)\s*[:\-#]\s*([A-Za-z0-9_\-]+)", re.I),
    re.compile(r"\b(?:Snapdeal\s*Reference\s*No|Reference\s*No)\s*[:\-#]?\s*([A-Za-z0-9_\-]+)", re.I),
    re.compile(r"\b(SLP\d{8,14})\b", re.I),
]

RE_SKU_WORD = re.compile(r"\bSKU\b", re.I)
RE_SKU_COLON = re.compile(
    r"\bSKU\s*(?:Code|Name|ID|No)?\s*[:\-#]\s*([A-Za-z0-9_\-\.\/\s]+?)(?=\s*(?:Size|Qty|Quantity|Color|Order|Sub\s*Order|Pack|\n|$))",
    re.I,
)
RE_TABLE_MATCH = re.compile(
    r"\bSKU\b(?:\s+Size)?(?:\s+Qty)?(?:\s+Color)?(?:\s+Order(?:\s*No\.?)?)?[\s\r\n]+([A-Za-z0-9_\-\.\/\s]+?)(?=\s*(?:Size|Qty|Free|One|[SML]\b|XL|XXL|\d{15}|$))",
    re.I,
)
RE_KNOWN_PATTERN = re.compile(
    r"\b((?:Po\d+Green|Po10Green|rspk\d+brown|rspk10brown|Green|Brown)[A-Za-z0-9_\-]*)\b",
    re.I,
)
RE_MEESHO_SUBORDER = re.compile(r"\b(\d{16,22}_\d+)\b")
RE_FLIPKART_ORDER = re.compile(r"\b(OD\d{16,22})\b", re.I)
RE_ORDER_NO_COLUMN = re.compile(
    r"\bOrder\s*No\.?[\s\r\n]+(?:[^\n\r]*[\r\n]+){0,6}?(\d{15,22}(?:_\d+)?)\b",
    re.I,
)
RE_ORDER_FALLBACK = re.compile(r"\b(\d{15,22}(?:_\d+)?)\b")


class PicklistGeneratorService:
    """Extracts SKUs and produces consolidated warehouse picking lists."""

    def extract_skus(
        self,
        text: str,
        known_wbl_id: Optional[str] = None,
    ) -> Tuple[List[ExtractedSKU], Optional[str]]:
        """Extract SKU items and genuine order identifier from label text.

        Returns (list_of_skus, detected_order_id).
        """
        if not text:
            return [], None

        order_id: Optional[str] = None

        # 1. Highest Priority: Meesho standard sub-order ID with underscore suffix (e.g. 345571562743113728_1)
        suborder_match = RE_MEESHO_SUBORDER.search(text)
        if suborder_match:
            order_id = suborder_match.group(1).strip()

        # 1b. Flipkart Order ID (e.g. OD438987223169162400)
        if not order_id:
            fk_order = RE_FLIPKART_ORDER.search(text)
            if fk_order:
                order_id = fk_order.group(1).strip()

        # 2. Priority: Order No. column lookup in label table
        if not order_id:
            col_match = RE_ORDER_NO_COLUMN.search(text)
            if col_match:
                cand = col_match.group(1).strip()
                if not known_wbl_id or cand != known_wbl_id:
                    order_id = cand

        # 3. Explicit prefix patterns (Order No: 12345, Sub Order No: ...)
        if not order_id:
            for pattern in COMPILED_ORDER_PATTERNS:
                match = pattern.search(text)
                if match:
                    cand = match.group(1).strip()
                    if not known_wbl_id or cand != known_wbl_id:
                        order_id = cand
                        break

        quantity = 1
        for pattern in COMPILED_QTY_PATTERNS:
            match = pattern.search(text)
            if match:
                try:
                    quantity = max(1, int(match.group(1).strip()))
                except ValueError:
                    quantity = 1
                break

        extracted_items: List[ExtractedSKU] = []
        seen_skus: Set[str] = set()

        def add_candidate(cand: str, qty: int = quantity):
            cleaned = cand.strip().strip(":,-#/")
            if (
                len(cleaned) >= 2
                and not cleaned.isdigit()
                and cleaned.upper() not in seen_skus
                and cleaned.upper() not in ("TAX", "INVOICE", "ORIGINAL", "SIZE", "QTY", "COLOR", "ORDER", "FREE", "SHIP", "BILL", "SOLD", "CODE", "NAME")
            ):
                seen_skus.add(cleaned.upper())
                extracted_items.append(
                    ExtractedSKU(
                        sku=cleaned,
                        quantity=qty,
                        order_id=order_id,
                    )
                )

        # 1. Line-by-line inspection (most accurate when newlines exist)
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        for idx, line in enumerate(lines):
            if RE_SKU_WORD.search(line):
                # Case A: SKU is followed by a colon/code on same line (e.g. SKU: BLU_KURTI_XL)
                same_match = RE_SKU_COLON.search(line)
                if same_match:
                    add_candidate(same_match.group(1))
                # Case B1: Flipkart / Shopsy SKU table (SKU ID | Description | QTY)
                elif re.search(r"\bSKU\s*ID\b", line, re.I) or ("description" in line.lower() and "qty" in line.lower()):
                    row_offset = 1
                    while idx + row_offset < len(lines):
                        item_line = lines[idx + row_offset]
                        if re.search(r"\b(not\s*for\s*resale|printed\s*at|tax\s*invoice|sold\s*by|gstin)\b", item_line, re.I):
                            break
                        if item_line.startswith("FMP") or item_line.startswith("OD"):
                            break

                        item_qty = 1
                        sku_cand = ""
                        if "|" in item_line:
                            parts = [p.strip() for p in item_line.split("|")]
                            # Format 1: Serial | SKU ID | Description | QTY (e.g. "1 | Green 0193 | Rospack Daily... | 1")
                            if parts[0].isdigit() and len(parts) >= 2:
                                sku_cand = parts[1].strip()
                                if len(parts) >= 4 and parts[3].isdigit():
                                    item_qty = max(1, int(parts[3]))
                                elif len(parts) >= 3 and parts[2].isdigit():
                                    item_qty = max(1, int(parts[2]))
                            else:
                                # Format 2: Serial+SKU | Description | QTY (e.g. "1 RSPK-PO10-GREEN-01 | ROSPACK... | 1")
                                sku_cand = re.sub(r"^\d+[\.\s]+", "", parts[0]).strip()
                                if len(parts) >= 3 and parts[2].isdigit():
                                    item_qty = max(1, int(parts[2]))
                                else:
                                    q_match = re.search(r"\b(\d{1,3})\s*$", item_line)
                                    if q_match:
                                        item_qty = max(1, int(q_match.group(1)))
                        else:
                            m_serial = re.match(r"^\d+[\.\s]+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)\s+(.+)", item_line)
                            if m_serial:
                                sku_cand = m_serial.group(1).strip()
                                q_match = re.search(r"\b(\d{1,3})\s*$", item_line)
                                if q_match:
                                    item_qty = max(1, int(q_match.group(1)))
                            else:
                                tokens = item_line.split()
                                if tokens:
                                    if tokens[0].isdigit() and len(tokens) > 1:
                                        tokens = tokens[1:]
                                    sku_cand = " ".join(tokens[:2]) if len(tokens) >= 2 else tokens[0]

                        if sku_cand and len(sku_cand) >= 2 and not sku_cand.isdigit():
                            add_candidate(sku_cand, item_qty)
                        row_offset += 1
                # Case B2: Standard Meesho table header (SKU Size Qty Color Order No.)
                elif idx + 1 < len(lines):
                    next_line = lines[idx + 1]

                    # Extract order ID if present in this line
                    order_match = re.search(r"\b(\d{15,22}(?:_\d+)?)\b", next_line)
                    if order_match:
                        order_id = order_match.group(1)

                    # Extract quantity if present
                    item_qty = quantity
                    qty_m = re.search(r"\b(?:Qty|Q)?\s*[:\-]?\s*(\d{1,3})\b", next_line, re.I)
                    if qty_m:
                        try:
                            item_qty = max(1, int(qty_m.group(1)))
                        except ValueError:
                            pass

                    # Extract full real SKU string before Size / Qty / Color / Order
                    # e.g. 'Rospack 80ml 074 Free Size 1 NA 344906827252171584_1' -> 'Rospack 80ml 074'
                    sku_candidate = re.split(
                        r"\s+(?:Free\s*Size|One\s*Size|Size\b|\b[SML]\b|\bXL\b|\bXXL\b|\bXXXL\b|\bNA\b|\d+\s*(?:NA|\d{15}))",
                        next_line,
                        flags=re.I,
                    )[0].strip()

                    if sku_candidate and len(sku_candidate) >= 2 and not sku_candidate.isdigit():
                        add_candidate(sku_candidate, item_qty)
                    else:
                        parts = next_line.split()
                        if parts:
                            add_candidate(parts[0], item_qty)
            # Case B3: Snapdeal table header (PRODUCT NAME ... QUANTITY)
            elif re.search(r"\bPRODUCT\s*NAME\b", line, re.I) and ("quantity" in line.lower() or (idx + 1 < len(lines) and "quantity" in lines[idx + 1].lower())):
                row_offset = 1
                while idx + row_offset < len(lines) and row_offset <= 6:
                    item_line = lines[idx + row_offset]
                    if re.search(r"\b(amount\s*already\s*paid|collect\s*cash|seller\s*address|seller\s*gstin|snapdeal)\b", item_line, re.I):
                        break

                    q_match = re.search(r"\s+(\d{1,3})\s*$", item_line)
                    item_qty = 1
                    clean_sku_line = item_line
                    if q_match:
                        item_qty = max(1, int(q_match.group(1)))
                        clean_sku_line = item_line[:q_match.start()].strip()

                    if clean_sku_line and not clean_sku_line.endswith("..") and len(clean_sku_line) >= 3 and not clean_sku_line.isdigit():
                        add_candidate(clean_sku_line, item_qty)
                    elif clean_sku_line and len(clean_sku_line) >= 3 and not clean_sku_line.isdigit() and not extracted_items:
                        add_candidate(clean_sku_line.rstrip("."), item_qty)
                    row_offset += 1

        # 2. Table regex pattern (works even if lines were space-joined)
        if not extracted_items:
            table_match = RE_TABLE_MATCH.search(text)
            if table_match:
                add_candidate(table_match.group(1))

        # 3. Known product SKU pattern fallback (Po10Green..., rspk10brown..., Green..., Brown...)
        if not extracted_items:
            known_pattern = RE_KNOWN_PATTERN.search(text)
            if known_pattern:
                add_candidate(known_pattern.group(1))

        # 4. Standard key-value patterns (e.g. SKU: ABC123, Item Code: XYZ)
        if not extracted_items:
            for pattern in COMPILED_SKU_PATTERNS:
                for match in pattern.finditer(text):
                    add_candidate(match.group(1))

        # Fallback for order ID extraction: find all 15-22 digit candidates, prioritizing non-waybill numbers
        if not order_id:
            for cand in RE_ORDER_FALLBACK.findall(text):
                cleaned_cand = cand.strip()
                # Skip if this number matches the courier Waybill / tracking number
                if known_wbl_id and cleaned_cand == known_wbl_id:
                    continue
                # Skip known courier AWB prefixes
                if cleaned_cand.startswith("13409") and len(cleaned_cand) <= 15:
                    continue
                order_id = cleaned_cand
                break

        if not order_id:
            slp_m = re.search(r"\b(SLP\d{8,16})\b", text, re.I)
            if slp_m:
                order_id = slp_m.group(1).upper()

        return extracted_items, order_id

    def group_skus_for_inspection(
        self,
        raw_labels: List[Dict],
        sku_engine: Optional[Any] = None,
        user_skus: Optional[List[Dict]] = None,
        smart_sku_detection: bool = False,
    ) -> Tuple[List[MainSkuSummary], List[SubSkuSummary]]:
        """Group extracted SKUs into Main Parent SKUs (e.g. GREEN, BROWN) and individual Sub-SKUs, prioritizing user's saved SKUs."""
        sku_map: Dict[str, Dict] = {}
        main_groups: Dict[str, Dict] = {}
        sku_to_main: Dict[str, str] = {}

        for item in raw_labels:
            skus: List[ExtractedSKU] = item.get("sku_items") or []
            courier = item.get("courier") or "Unassigned"
            lbl_raw_text = item.get("raw_text") or ""

            if not skus:
                m_name = "UNMATCHED"
                sku_key = "UNMATCHED"
                if sku_key not in sku_map:
                    sku_map[sku_key] = {
                        "quantity": 0,
                        "label_count": 0,
                        "couriers": set(),
                    }
                sku_map[sku_key]["quantity"] += 1
                sku_map[sku_key]["label_count"] += 1
                sku_map[sku_key]["couriers"].add(courier)

                if m_name not in main_groups:
                    main_groups[m_name] = {
                        "total_quantity": 0,
                        "label_count": 0,
                        "courier_counts": {},
                        "sub_skus": [],
                    }
                main_groups[m_name]["label_count"] += 1
                main_groups[m_name]["total_quantity"] += 1
                main_groups[m_name]["courier_counts"][courier] = (
                    main_groups[m_name]["courier_counts"].get(courier, 0) + 1
                )
                continue

            # Identify primary main SKU category for this label:
            # If already matched or user-confirmed via description, use it directly; otherwise resolve prioritizing saved SKUs
            matched_desc = getattr(skus[0], "description", None)
            if matched_desc and str(matched_desc).strip() and str(matched_desc).strip().upper() not in ("UNMATCHED", "UNKNOWN", "UNKNOWN SKUS", "OTHER"):
                primary_main_sku = str(matched_desc).strip().upper()
            else:
                primary_main_sku = get_main_sku_group(
                    skus[0].sku,
                    sku_engine=sku_engine,
                    user_skus=user_skus,
                    full_text=lbl_raw_text,
                    smart_sku_detection=smart_sku_detection,
                )
            sku_to_main[skus[0].sku] = primary_main_sku

            if primary_main_sku not in main_groups:
                main_groups[primary_main_sku] = {
                    "total_quantity": 0,
                    "label_count": 0,
                    "courier_counts": {},
                    "sub_skus": [],
                }
            main_groups[primary_main_sku]["label_count"] += 1
            main_groups[primary_main_sku]["courier_counts"][courier] = (
                main_groups[primary_main_sku]["courier_counts"].get(courier, 0) + 1
            )

            for sku_obj in skus:
                sku_key = sku_obj.sku
                if sku_key not in sku_map:
                    sku_map[sku_key] = {
                        "quantity": 0,
                        "label_count": 0,
                        "couriers": set(),
                    }
                sku_map[sku_key]["quantity"] += sku_obj.quantity
                sku_map[sku_key]["label_count"] += 1
                sku_map[sku_key]["couriers"].add(courier)
                main_groups[primary_main_sku]["total_quantity"] += sku_obj.quantity

        def natural_sort_key(s: str):
            return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", s)]

        # Build SubSkuSummary list sorted alphabetically and numerically (letter and number wise)
        all_sub_skus: List[SubSkuSummary] = []
        for sku_name, data in sorted(sku_map.items(), key=lambda x: natural_sort_key(x[0])):
            if sku_name == "UNMATCHED":
                main_cat = "UNMATCHED"
            elif sku_name in sku_to_main:
                main_cat = sku_to_main[sku_name]
            else:
                main_cat = get_main_sku_group(
                    sku_name,
                    sku_engine=sku_engine,
                    user_skus=user_skus,
                    smart_sku_detection=smart_sku_detection,
                )

            sub_item = SubSkuSummary(
                sku=sku_name,
                main_sku=main_cat,
                quantity=data["quantity"],
                label_count=data["label_count"],
                courier_partners=sorted(list(data["couriers"])),
            )
            all_sub_skus.append(sub_item)
            if main_cat in main_groups:
                main_groups[main_cat]["sub_skus"].append(sub_item)

        # Main SKU summaries sorted: Available/Saved SKUs first (Rank 0), then UNKNOWN (Rank 1), then UNMATCHED (Rank 2)
        def main_sort_key(item_tuple):
            name = item_tuple[0]
            upper = name.upper()
            if upper == "UNMATCHED":
                return (2, upper)
            if upper in ("UNKNOWN", "UNKNOWN SKUS", "OTHER"):
                return (1, upper)
            return (0, upper)

        main_sku_summaries: List[MainSkuSummary] = []
        for m_name, m_data in sorted(main_groups.items(), key=main_sort_key):
            main_sku_summaries.append(
                MainSkuSummary(
                    main_sku=m_name,
                    total_quantity=max(m_data["total_quantity"], m_data["label_count"]),
                    label_count=m_data["label_count"],
                    courier_counts=m_data["courier_counts"],
                    sub_skus=m_data.get("sub_skus", []),
                )
            )

        return main_sku_summaries, all_sub_skus

    def build_picklist(
        self,
        label_records: List[Dict],
    ) -> Tuple[List[PicklistItem], str]:
        """Aggregate SKU items across all processed labels and generate CSV.

        Returns (list_of_picklist_items, csv_content_string).
        """
        # sku -> {quantity, label_count, couriers, orders, status}
        sku_map: Dict[str, Dict] = {}
        unmatched_count = 0
        unmatched_couriers: Set[str] = set()
        unmatched_orders: List[str] = []

        for record in label_records:
            skus: List[ExtractedSKU] = record.get("sku_items") or []
            courier = record.get("courier_partner") or "Unassigned"
            order_id = record.get("order_id")

            if not skus:
                unmatched_count += 1
                unmatched_couriers.add(courier)
                if order_id and order_id not in unmatched_orders:
                    unmatched_orders.append(order_id)
                continue

            for item in skus:
                sku_key = item.sku
                if sku_key not in sku_map:
                    sku_map[sku_key] = {
                        "total_quantity": 0,
                        "label_count": 0,
                        "couriers": set(),
                        "orders": [],
                        "status": "MATCHED",
                    }
                sku_map[sku_key]["total_quantity"] += item.quantity
                sku_map[sku_key]["label_count"] += 1
                sku_map[sku_key]["couriers"].add(courier)
                if item.order_id and item.order_id not in sku_map[sku_key]["orders"]:
                    sku_map[sku_key]["orders"].append(item.order_id)

        picklist_items: List[PicklistItem] = []

        # Add matched SKUs sorted by SKU name
        for sku, data in sorted(sku_map.items(), key=lambda x: x[0]):
            picklist_items.append(
                PicklistItem(
                    sku=sku,
                    total_quantity=data["total_quantity"],
                    label_count=data["label_count"],
                    courier_partners=sorted(list(data["couriers"])),
                    status="MATCHED",
                    order_references=data["orders"],
                )
            )

        # Include unmatched labels if any so total parcel count matches exactly
        if unmatched_count > 0:
            picklist_items.append(
                PicklistItem(
                    sku="UNMATCHED",
                    total_quantity=unmatched_count,
                    label_count=unmatched_count,
                    courier_partners=sorted(list(unmatched_couriers)),
                    status="UNMATCHED",
                    order_references=unmatched_orders,
                )
            )

        # Generate CSV content
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow([
            "SKU",
            "Quantity",
            "Label Count",
            "Courier Partners",
            "Status",
            "Order References",
        ])

        for item in picklist_items:
            writer.writerow([
                item.sku,
                item.total_quantity,
                item.label_count,
                "; ".join(item.courier_partners),
                item.status,
                "; ".join(item.order_references) if item.order_references else "N/A",
            ])

        csv_content = output.getvalue()
        output.close()

        return picklist_items, csv_content


picklist_generator_service = PicklistGeneratorService()
