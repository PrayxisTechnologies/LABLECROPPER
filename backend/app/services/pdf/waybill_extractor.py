"""Waybill (WBL) / AWB Tracking ID extraction and marketplace detection service."""

import re
from typing import Optional

# Precompiled regex patterns for logistics tracking / AWB / Waybill numbers
RE_EXPLICIT_AWB = re.compile(
    r"\b(?:AWB(?:\s*No\.?|\s*Number)?|WBL(?:\s*No\.?|\s*ID)?|Waybill(?:\s*No\.?|\s*ID)?|Tracking(?:\s*ID|\s*No\.?|\s*Number)?)\s*[:\-#]?\s*([A-Za-z0-9]{8,24})\b",
    re.I,
)

# Courier-specific tracking code patterns
# 1. Valmo (e.g. VL0085889810857, PLO-...)
RE_VALMO_WBL = re.compile(r"\b(VL\s*\d{8,18}|PLO\-[A-Za-z0-9]{6,16})\b", re.I)

# 2. Shadowfax (e.g. SF4361758012FPL, SF4361758012, SFX...)
# Note: On Meesho/Flipkart, Shadowfax AWBs commonly end with warehouse suffixes like FPL, FPD, DEL, EXP
RE_SHADOWFAX_WBL = re.compile(
    r"\b(SF\s*\d{8,14}\s*[A-Za-z]{0,5}|SFX\s*\d{7,14}\s*[A-Za-z]{0,5}|SF[A-Za-z0-9]{10,18})\b",
    re.I,
)

# 3. Xpressbees (e.g. 134096168221136, 14..., XB...)
RE_XPRESSBEES_WBL = re.compile(
    r"\b(13409\d{8,12}|14\d{11,14}|XB[A-Za-z0-9]{8,16})\b",
    re.I,
)

# 4. Ekart Logistics (e.g. FMPP4416844984, FMPC..., FMP..., MP..., SR...)
RE_EKART_WBL = re.compile(
    r"\b(FMPP\s*\d{8,16}|FMPC\s*\d{8,16}|FMP[A-Za-z0-9]{8,16}|MP\d{8,16}|SR[A-Za-z0-9]{8,16})\b",
    re.I,
)

# 5. Delhivery (12-14 digits, e.g. 7269657758274 or DELHIVERY...)
RE_DELHIVERY_WBL = re.compile(r"\b(\d{12,14}|DELHIVERY\d{8,14})\b", re.I)

# 5b. Snapdeal Reference Number (e.g. SLP5204061666)
RE_SNAPDEAL_WBL = re.compile(r"\b(SLP\d{8,14})\b", re.I)

# 6. Ecom Express (8-12 digits)
RE_ECOM_WBL = re.compile(r"\b([89]\d{8,12}|AIR\d{8,12})\b", re.I)

# 7. Blue Dart (8-12 digits)
RE_BLUEDART_WBL = re.compile(r"\b(\d{8,12})\b")

# 8. Amazon ATS (TBA... or ATS...)
RE_AMAZON_WBL = re.compile(r"\b(TBA\d{10,14}|ATS[A-Za-z0-9]{8,16})\b", re.I)

# 9. DTDC
RE_DTDC_WBL = re.compile(r"\b([A-Za-z]\d{8,12}|D\d{8,12})\b", re.I)


def _clean_cand(val: str) -> str:
    """Normalize tracking ID by removing inner spaces and upper-casing."""
    return re.sub(r"\s+", "", val).strip().upper()


def extract_waybill_id(text: str, courier: Optional[str] = None) -> Optional[str]:
    """Extract courier tracking / AWB / WBL number from label text.

    Examples:
    - Shadowfax: 'SF4361758012FPL'
    - Valmo: 'VL0085889810857'
    - Xpressbees: '134096168221136'
    """
    if not text:
        return None

    courier_upper = (courier or "").upper()

    # 1. Courier specific prioritized checks
    if "VALMO" in courier_upper:
        m = RE_VALMO_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    if "SHADOWFAX" in courier_upper:
        m = RE_SHADOWFAX_WBL.search(text)
        if m:
            cand = _clean_cand(m.group(1))
            if not cand.endswith("_1") and len(cand) >= 8:
                return cand

    if "XPRESSBEES" in courier_upper:
        m = RE_XPRESSBEES_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    if "EKART" in courier_upper:
        m = RE_EKART_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    if "DELHIVERY" in courier_upper:
        m = RE_DELHIVERY_WBL.search(text)
        if m:
            cand = _clean_cand(m.group(1))
            if not cand.endswith("_1") and len(cand) >= 8:
                return cand

    if "ECOM" in courier_upper:
        m = RE_ECOM_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    if "BLUE" in courier_upper and "DART" in courier_upper:
        m = RE_BLUEDART_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    if "AMAZON" in courier_upper:
        m = RE_AMAZON_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    if "DTDC" in courier_upper:
        m = RE_DTDC_WBL.search(text)
        if m:
            return _clean_cand(m.group(1))

    # 2. Explicit keyword search (AWB:, Tracking ID:, WBL:)
    explicit_match = RE_EXPLICIT_AWB.search(text)
    if explicit_match:
        cand = _clean_cand(explicit_match.group(1))
        # Ensure not an order ID
        if not cand.endswith("_1") and not cand.endswith("_2") and not cand.startswith("OD") and len(cand) >= 8:
            return cand

    # 3. Fallback scan across all known courier provider formats
    for pattern in (
        RE_VALMO_WBL,
        RE_SHADOWFAX_WBL,
        RE_XPRESSBEES_WBL,
        RE_EKART_WBL,
        RE_AMAZON_WBL,
        RE_DELHIVERY_WBL,
        RE_SNAPDEAL_WBL,
        RE_ECOM_WBL,
        RE_DTDC_WBL,
    ):
        match = pattern.search(text)
        if match:
            cand = _clean_cand(match.group(1))
            if not cand.endswith("_1") and not cand.endswith("_2") and not cand.startswith("OD") and len(cand) >= 8:
                return cand

    return None


def detect_marketplace(text: str = "", filename: str = "") -> str:
    """Detect eCommerce marketplace (Meesho, Flipkart, Amazon, Myntra, Snapdeal)."""
    combined = f"{filename} {text}".lower()

    if any(k in combined for k in ("flipkart", "shopsy", "ekart", "e-kart", "fmpp", "fmpc", "not for resale")):
        return "Flipkart"
    if "amazon" in combined or "amzn" in combined or "ats" in combined:
        return "Amazon"
    if "myntra" in combined:
        return "Myntra"
    if "snapdeal" in combined:
        return "Snapdeal"
    if "meesho" in combined or "sub_order" in combined or "sub order" in combined:
        return "Meesho"

    # Default to Meesho as primary platform
    return "Meesho"
