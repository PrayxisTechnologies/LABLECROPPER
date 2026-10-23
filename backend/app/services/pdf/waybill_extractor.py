"""Waybill (WBL) / AWB Tracking ID extraction and marketplace detection service."""

import re
from typing import Optional

# Precompiled regex patterns for logistics tracking / AWB / Waybill numbers
RE_EXPLICIT_AWB = re.compile(
    r"\b(?:AWB(?:\s*No\.?|\s*Number)?|WBL(?:\s*No\.?|\s*ID)?|Waybill(?:\s*No\.?|\s*ID)?|Tracking(?:\s*ID|\s*No\.?|\s*Number)?)\s*[:\-#]?\s*([A-Za-z0-9]{8,24})\b",
    re.I,
)

# Courier-specific tracking code patterns
RE_VALMO_WBL = re.compile(r"\b(VL\d{9,16})\b", re.I)
RE_SHADOWFAX_WBL = re.compile(r"\b(SF\d{9,16}|SFX\d{8,14})\b", re.I)
RE_XPRESSBEES_WBL = re.compile(r"\b(13409\d{8,12}|XB[A-Za-z0-9]{8,14})\b", re.I)
RE_EKART_WBL = re.compile(r"\b(FMPC\d{8,14}|MP\d{8,14}|SR[A-Za-z0-9]{8,14})\b", re.I)
RE_DELHIVERY_WBL = re.compile(r"\b([123]\d{11,13})\b")
RE_ECOM_WBL = re.compile(r"\b([89]\d{8,10})\b")
RE_BLUEDART_WBL = re.compile(r"\b(\d{8,11})\b")


def extract_waybill_id(text: str, courier: Optional[str] = None) -> Optional[str]:
    """Extract courier tracking / AWB / WBL number from label text.

    Image 2 example: 'VL0085864655841'
    """
    if not text:
        return None

    # 1. Courier specific prioritized checks
    courier_upper = (courier or "").upper()
    if "VALMO" in courier_upper:
        m = RE_VALMO_WBL.search(text)
        if m:
            return m.group(1).upper()

    if "SHADOWFAX" in courier_upper:
        m = RE_SHADOWFAX_WBL.search(text)
        if m:
            return m.group(1).upper()

    if "XPRESSBEES" in courier_upper:
        m = RE_XPRESSBEES_WBL.search(text)
        if m:
            return m.group(1).upper()

    if "EKART" in courier_upper:
        m = RE_EKART_WBL.search(text)
        if m:
            return m.group(1).upper()

    if "DELHIVERY" in courier_upper:
        m = RE_DELHIVERY_WBL.search(text)
        if m:
            return m.group(1)

    # 2. Explicit keyword search (AWB:, Tracking ID:, WBL:)
    explicit_match = RE_EXPLICIT_AWB.search(text)
    if explicit_match:
        cand = explicit_match.group(1).strip()
        # Ensure not an order ID
        if not cand.endswith("_1") and len(cand) >= 8:
            return cand.upper()

    # 3. Fallback scan across known provider formats
    for pattern in (
        RE_VALMO_WBL,
        RE_SHADOWFAX_WBL,
        RE_XPRESSBEES_WBL,
        RE_EKART_WBL,
    ):
        match = pattern.search(text)
        if match:
            return match.group(1).upper()

    return None


def detect_marketplace(text: str = "", filename: str = "") -> str:
    """Detect eCommerce marketplace (Meesho, Flipkart, Amazon, Myntra, Snapdeal)."""
    combined = f"{filename} {text}".lower()

    if "flipkart" in combined or "ekart" in combined or "fmpc" in combined:
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
