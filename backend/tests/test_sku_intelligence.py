"""Unit tests for the Smart SKU Intelligence Engine."""

from app.services.sku_intelligence.engine import SKUIntelligenceEngine, normalize_text


def test_text_normalization():
    """Verify that normalize_text removes punctuation and collapses whitespace."""
    raw = "  Cotton Kurti - Size XL / Green #507!!  "
    norm = normalize_text(raw)
    assert norm == "cotton kurti size xl green 507"


def test_exact_canonical_match():
    """Verify Level 1: exact canonical SKU code match."""
    user_skus = [
        {
            "sku_code": "Po10Green",
            "product_name": "Embroidered Green Kurti",
            "keywords": ["green kurti", "cotton"],
            "aliases": ["GRN-10"],
            "priority": 1,
            "is_active": True,
        },
        {
            "sku_code": "rspk10brown",
            "product_name": "Brown Floral Saree",
            "keywords": ["brown saree"],
            "aliases": [],
            "priority": 0,
            "is_active": True,
        },
    ]

    engine = SKUIntelligenceEngine(user_skus=user_skus)

    # Test label with canonical SKU code embedded
    label_text = "SKU: Po10Green Qty: 1 Courier: Valmo Order: 123456789"
    sku, match_type, conf, is_ambiguous, candidates = engine.match_label_text(label_text)

    assert sku == "Po10Green"
    assert match_type == "exact_canonical"
    assert conf == 1.0
    assert is_ambiguous is False
    assert candidates == ["Po10Green"]


def test_saved_user_decision_match():
    """Verify Level 2: previously confirmed user decisions take priority over raw keywords."""
    user_skus = [
        {
            "sku_code": "Po10Green",
            "product_name": "Green Kurti",
            "keywords": ["green"],
            "priority": 0,
            "is_active": True,
        },
        {
            "sku_code": "Po10Emerald",
            "product_name": "Emerald Top",
            "keywords": ["emerald"],
            "priority": 0,
            "is_active": True,
        },
    ]
    user_decisions = [
        {
            "raw_product_text": "meesho designer summer edition green top",
            "normalized_product_text": "meesho designer summer edition green top",
            "chosen_sku": "Po10Emerald",
        }
    ]

    engine = SKUIntelligenceEngine(user_skus=user_skus, user_decisions=user_decisions)

    # Label text contains the previously confirmed decision snippet
    label_text = "Item: meesho designer summer edition green top Size M"
    sku, match_type, conf, is_ambiguous, _ = engine.match_label_text(label_text)

    # Must choose the user's previously saved decision (Po10Emerald) even though "green" is present
    assert sku == "Po10Emerald"
    assert "saved_decision" in match_type
    assert conf >= 0.95
    assert is_ambiguous is False


def test_exact_keyword_and_alias_match():
    """Verify Level 3: exact keyword and alias phrase matching."""
    user_skus = [
        {
            "sku_code": "KURTI-BLU-L",
            "product_name": "Blue Anarkali Kurti",
            "keywords": ["blue anarkali", "rayon blue"],
            "aliases": ["BLU-ANAR-L"],
            "priority": 0,
            "is_active": True,
        }
    ]

    engine = SKUIntelligenceEngine(user_skus=user_skus)

    # Label containing exact keyword phrase
    label_text = "Order Details: 1x blue anarkali size L (Meesho ID #987654)"
    sku, match_type, conf, is_ambiguous, candidates = engine.match_label_text(label_text)

    assert sku == "KURTI-BLU-L"
    assert match_type == "exact_keyword"
    assert conf == 0.90
    assert is_ambiguous is False

    # Label containing alias
    label_alias = "Packing slip BLU-ANAR-L standard parcel"
    sku2, _, conf2, _, _ = engine.match_label_text(label_alias)
    assert sku2 == "KURTI-BLU-L"
    assert conf2 >= 0.85


def test_ambiguity_detection_for_competing_candidates():
    """Verify that when 2 or more active SKUs match with similar confidence, ambiguity is flagged."""
    user_skus = [
        {
            "sku_code": "Po10Green",
            "product_name": "Green Kurti",
            "keywords": ["green printed kurti"],
            "priority": 0,
            "is_active": True,
        },
        {
            "sku_code": "rspk10brown",
            "product_name": "Brown Kurti",
            "keywords": ["brown printed kurti"],
            "priority": 0,
            "is_active": True,
        },
    ]

    engine = SKUIntelligenceEngine(user_skus=user_skus)

    # Multi-item label containing both canonical codes on one parcel!
    label_text = "Bundle Pack: 1x Po10Green and 1x rspk10brown delivered together"
    sku, match_type, conf, is_ambiguous, candidates = engine.match_label_text(label_text)

    assert is_ambiguous is True
    assert set(candidates) == {"Po10Green", "rspk10brown"}


def test_inactive_skus_are_ignored():
    """Verify that deactivated SKUs do not trigger matches."""
    user_skus = [
        {
            "sku_code": "OLD-SKU-99",
            "product_name": "Discontinued Yellow Saree",
            "keywords": ["yellow saree"],
            "priority": 0,
            "is_active": False,  # Deactivated
        }
    ]

    engine = SKUIntelligenceEngine(user_skus=user_skus)
    label_text = "SKU: OLD-SKU-99 yellow saree"
    sku, match_type, conf, is_ambiguous, _ = engine.match_label_text(label_text)

    # Since it is inactive, no match should occur
    assert sku is None
    assert match_type == "unmatched"
