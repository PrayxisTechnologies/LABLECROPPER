"""Courier partner detection and deterministic batch sorting service."""

import re
from typing import Dict, List, Optional, Tuple

# Known logistics partners with regex patterns ordered by frequency on Meesho / Indian E-commerce
COURIER_PATTERNS = [
    ("Valmo", [
        r"\bVALMO\w*\b",
        r"\bVL\d{8,}\b",
        r"\bPLO\-[A-Z0-9]*\b",
        r"\bVALMO\s+LOGISTICS\b",
    ]),
    ("Shadowfax", [
        r"\bSHADOWFAX\w*\b",
        r"\bSF\d{10,}\b",
        r"\bSFX\b",
    ]),
    ("Xpressbees", [
        r"\bXPRESS\s*BEES\b",
        r"\bXPRESSBEES\b",
        r"\b13409\d{9,}\b",
        r"\bXB\b",
    ]),
    ("Delhivery", [
        r"\bDELHIVERY\s+(SURFACE|EXPRESS|AIR)\b",
        r"\bDELHIVERY\b",
    ]),
    ("Ekart", [
        r"\bEKART\s+LOGISTICS\b",
        r"\bEKART\b",
        r"\bE-KART\b",
    ]),
    ("Ecom Express", [
        r"\bECOM\s+EXPRESS\b",
        r"\bECOM\b",
    ]),
    ("Blue Dart", [
        r"\bBLUE\s*DART\b",
        r"\bBLUEDART\b",
    ]),
    ("DTDC", [
        r"\bDTDC(\s+EXPRESS)?\b",
    ]),
    ("Amazon Shipping", [
        r"\bAMAZON\s+SHIPPING\b",
    ]),
]

# Combined single regex for each provider for microsecond throughput
FAST_COURIER_CHECKS = [
    ("Valmo", re.compile(r"\b(VALMO\w*|VL\d{8,}|PLO\-[A-Z0-9]*|VALMO\s+LOGISTICS)\b", re.I)),
    ("Shadowfax", re.compile(r"\b(SHADOWFAX\w*|SF\d{10,}|SFX)\b", re.I)),
    ("Xpressbees", re.compile(r"\b(XPRESS\s*BEES|XPRESSBEES|13409\d{9,}|XB)\b", re.I)),
    ("Delhivery", re.compile(r"\bDELHIVERY(?:\s+(?:SURFACE|EXPRESS|AIR))?\b", re.I)),
    ("Ekart", re.compile(r"\b(EKART(?:\s+LOGISTICS)?|E\-KART)\b", re.I)),
    ("Ecom Express", re.compile(r"\b(ECOM\s+EXPRESS|ECOM)\b", re.I)),
    ("Blue Dart", re.compile(r"\b(BLUE\s*DART|BLUEDART)\b", re.I)),
    ("DTDC", re.compile(r"\bDTDC(?:\s+EXPRESS)?\b", re.I)),
    ("Amazon Shipping", re.compile(r"\bAMAZON\s+SHIPPING\b", re.I)),
]


class CourierSorterService:
    """Detects courier partners and provides deterministic batch sorting."""

    def detect_courier(self, text: str, header_text: Optional[str] = None) -> Tuple[str, float]:
        """Detect logistics provider from page text.

        Returns (canonical_courier_name, confidence).
        """
        target = header_text or text
        if not target:
            return "Unassigned", 0.0

        for name, regex in FAST_COURIER_CHECKS:
            if regex.search(target):
                return name, 0.95

        # If header_text was checked and matched nothing, fallback to text
        if header_text and text and header_text != text:
            for name, regex in FAST_COURIER_CHECKS:
                if regex.search(text):
                    return name, 0.85

        return "Unassigned", 0.0

    def sort_records(self, records: List[Dict]) -> List[Dict]:
        """Deterministically sort processed label items by courier, then by order ref or source page.

        Unassigned items are placed at the end.
        """
        def sort_key(item: Dict) -> Tuple[int, str, str, int]:
            courier = item.get("courier_partner", "Unassigned")
            is_unassigned = 1 if courier == "Unassigned" else 0
            order_ref = str(item.get("order_id") or "")
            page_no = int(item.get("pno", item.get("page_number", 0)))
            return (is_unassigned, courier.lower(), order_ref, page_no)

        return sorted(records, key=sort_key)

    def sort_by_courier(self, records: List[Dict]) -> List[Dict]:
        """Group labels by courier partner (largest volume first, e.g. Valmo, then Shadowfax, then Xpress Bees),
        then by Main SKU and Sub-SKU."""
        from app.services.picklist.generator import get_main_sku_group

        # Count frequencies so the top courier (e.g. Valmo: 162) comes first, matching the summary list
        courier_frequencies: Dict[str, int] = {}
        for r in records:
            c = r.get("courier_partner", "Unassigned")
            courier_frequencies[c] = courier_frequencies.get(c, 0) + 1

        def courier_sort_key(item: Dict) -> Tuple[int, int, str, str, str, int]:
            courier = item.get("courier_partner", "Unassigned")
            is_unassigned = 1 if courier == "Unassigned" else 0
            freq = -courier_frequencies.get(courier, 0)
            sku_items = item.get("sku_items") or []
            if sku_items:
                primary_sku = getattr(sku_items[0], "sku", str(sku_items[0]))
                main_sku = get_main_sku_group(primary_sku).upper()
            else:
                primary_sku = "ZZZ_UNMATCHED"
                main_sku = "ZZZ_UNMATCHED"
            page_no = int(item.get("pno", item.get("page_number", 0)))
            return (is_unassigned, freq, courier.lower(), main_sku, primary_sku.upper(), page_no)

        return sorted(records, key=courier_sort_key)

    def sort_by_sku(self, records: List[Dict]) -> List[Dict]:
        """Group labels by Main SKU first (e.g. BROWN, GREEN), then by Sub-SKU."""
        from app.services.picklist.generator import get_main_sku_group

        def sku_sort_key(item: Dict) -> Tuple[int, str, str, int]:
            sku_items = item.get("sku_items") or []
            if sku_items:
                primary_sku = getattr(sku_items[0], "sku", str(sku_items[0]))
                main_sku = get_main_sku_group(primary_sku).upper()
                is_unmatched = 0
            else:
                primary_sku = "ZZZ_UNMATCHED"
                main_sku = "ZZZ_UNMATCHED"
                is_unmatched = 1
            idx = int(item.get("original_index", 0))
            return (is_unmatched, main_sku, primary_sku.upper(), idx)

        return sorted(records, key=sku_sort_key)

    def sort_by_sku_and_courier(self, records: List[Dict]) -> List[Dict]:
        """Group first by Main SKU (e.g. BROWN, GREEN), then by Delivery Partner (e.g. Valmo, Shadowfax),
        then by Sub-SKU, then by original page sequence.

        Expected output structure:
        - ALL BROWN labels:
            - Valmo labels (sub-SKU sorted)
            - Shadowfax labels (sub-SKU sorted)
            - Xpress Bees labels (sub-SKU sorted)
        - ALL GREEN labels:
            - Valmo labels
            - Shadowfax labels
            - Xpress Bees labels
        - Unmatched labels at the end, grouped by delivery partner.
        """
        from app.services.picklist.generator import get_main_sku_group

        def sku_courier_sort_key(item: Dict) -> Tuple[int, str, int, str, str, int]:
            sku_items = item.get("sku_items") or []
            if sku_items:
                primary_sku = getattr(sku_items[0], "sku", str(sku_items[0]))
                main_sku = get_main_sku_group(primary_sku).upper()
                is_unmatched = 0
            else:
                primary_sku = "ZZZ_UNMATCHED"
                main_sku = "ZZZ_UNMATCHED"
                is_unmatched = 1

            courier = item.get("courier_partner", "Unassigned")
            is_unassigned_courier = 1 if courier == "Unassigned" else 0
            idx = int(item.get("original_index", 0))

            return (
                is_unmatched,
                main_sku,
                is_unassigned_courier,
                courier.lower(),
                primary_sku.upper(),
                idx,
            )

        return sorted(records, key=sku_courier_sort_key)


courier_sorter_service = CourierSorterService()
