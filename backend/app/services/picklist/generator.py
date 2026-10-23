"""SKU extraction and picklist CSV generation service."""

import csv
import io
import re
from typing import Dict, List, Optional, Set, Tuple
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


def get_main_sku_group(sku: str) -> str:
    """Extract parent/main SKU category like 'BROWN', 'GREEN', or alpha prefix."""
    sku_upper = sku.upper()
    for color in COLOR_KEYWORDS:
        if color in sku_upper:
            return color
    # Alphanumeric prefix before trailing digits/specifiers
    prefix_match = re.match(r"^([A-Za-z_\-]+)", sku)
    if prefix_match:
        prefix = prefix_match.group(1).rstrip("_-").upper()
        if len(prefix) >= 2:
            return prefix
    return "OTHER"


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
]

RE_SKU_WORD = re.compile(r"\bSKU\b", re.I)
RE_SKU_COLON = re.compile(
    r"\bSKU\s*(?:Code|Name|ID|No)?\s*[:\-#]\s*([A-Za-z0-9_\-\.\/\s]+?)(?=\s*(?:Size|Qty|Quantity|Color|Order|Sub\s*Order|\n|$))",
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
RE_ORDER_FALLBACK = re.compile(r"\b(\d{15,22}(?:_\d+)?)\b")


class PicklistGeneratorService:
    """Extracts SKUs and produces consolidated warehouse picking lists."""

    def extract_skus(self, text: str) -> Tuple[List[ExtractedSKU], Optional[str]]:
        """Extract SKU items and order identifier from label text.

        Returns (list_of_skus, detected_order_id).
        """
        if not text:
            return [], None

        order_id: Optional[str] = None
        for pattern in COMPILED_ORDER_PATTERNS:
            match = pattern.search(text)
            if match:
                order_id = match.group(1).strip()
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
                # Case B: Standard Meesho table header (SKU Size Qty Color Order No.)
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

        # Fallback for order ID extraction (Meesho 18-digit IDs)
        if not order_id:
            order_match = RE_ORDER_FALLBACK.search(text)
            if order_match:
                order_id = order_match.group(1)

        return extracted_items, order_id

    def group_skus_for_inspection(
        self,
        raw_labels: List[Dict],
    ) -> Tuple[List[MainSkuSummary], List[SubSkuSummary]]:
        """Group extracted SKUs into Main Parent SKUs (e.g. GREEN, BROWN) and individual Sub-SKUs, sorted alphabetically A-Z."""
        sku_map: Dict[str, Dict] = {}
        main_groups: Dict[str, Dict] = {}

        for item in raw_labels:
            skus: List[ExtractedSKU] = item.get("sku_items") or []
            courier = item.get("courier") or "Unassigned"

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

            # Identify primary main SKU category for this label
            primary_main_sku = get_main_sku_group(skus[0].sku)
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

        # Build SubSkuSummary list sorted alphabetically A-Z by SKU name
        all_sub_skus: List[SubSkuSummary] = []
        for sku_name, data in sorted(sku_map.items(), key=lambda x: x[0].lower()):
            main_cat = get_main_sku_group(sku_name) if sku_name != "UNMATCHED" else "UNMATCHED"
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

        # Main SKU summaries sorted alphabetically A-Z (e.g. BROWN, GREEN)
        main_sku_summaries: List[MainSkuSummary] = []
        for m_name, m_data in sorted(main_groups.items(), key=lambda x: x[0].lower()):
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
