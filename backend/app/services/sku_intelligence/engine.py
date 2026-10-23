"""Smart SKU Intelligence Engine for deterministic, explainable product matching."""

import re
from typing import Any, Dict, List, Optional, Set, Tuple
from app.core.logging import logger


def normalize_text(text: str) -> str:
    """Normalize text by converting to lowercase, removing non-alphanumeric punctuation, and collapsing whitespace."""
    if not text:
        return ""
    # Replace non-alphanumeric characters with spaces (preserve alphanumeric)
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", text)
    # Collapse multiple whitespaces
    return " ".join(cleaned.lower().split())


class SKUIntelligenceEngine:
    """Intelligent SKU matching engine with explainable hierarchy and ambiguity detection."""

    def __init__(
        self,
        user_skus: List[Dict[str, Any]],
        user_decisions: Optional[List[Dict[str, Any]]] = None,
        sensitivity: str = "medium",
    ) -> None:
        """Initialize engine with user's active SKUs and saved decisions.

        user_skus: list of dicts from `user_skus` collection:
          - sku_code: str
          - product_name: str
          - keywords: list[str]
          - aliases: list[str]
          - priority: int
        """
        self.user_skus = [s for s in user_skus if s.get("is_active", True)]
        # Sort by priority descending so higher priority SKUs break ties
        self.user_skus.sort(key=lambda x: x.get("priority", 0), reverse=True)

        self.user_decisions = user_decisions or []
        self.sensitivity = sensitivity

        # Build fast lookup indexes
        self._build_indexes()

    def _build_indexes(self) -> None:
        """Pre-index canonical codes, keywords, and decisions for fast O(1)/O(N) matching."""
        # 1. Canonical codes map: UPPERCASE code -> sku_code
        self.canonical_map: Dict[str, str] = {}
        for s in self.user_skus:
            code = s.get("sku_code", "").strip()
            if code:
                self.canonical_map[code.upper()] = code

        # 2. Decisions map: normalized_product_text -> chosen_sku
        self.decisions_map: Dict[str, str] = {}
        for d in self.user_decisions:
            norm = d.get("normalized_product_text", "").strip()
            chosen = d.get("chosen_sku", "").strip()
            if norm and chosen:
                self.decisions_map[norm] = chosen

        # 3. Keyword / Alias index: normalized phrase -> list of matching SKU codes
        self.keyword_index: Dict[str, List[str]] = {}
        for s in self.user_skus:
            code = s.get("sku_code", "").strip()
            if not code:
                continue

            phrases: Set[str] = set()
            for kw in s.get("keywords", []):
                norm_kw = normalize_text(kw)
                if norm_kw:
                    phrases.add(norm_kw)
            for alias in s.get("aliases", []):
                norm_al = normalize_text(alias)
                if norm_al:
                    phrases.add(norm_al)
            # Also include normalized product title
            norm_name = normalize_text(s.get("product_name", ""))
            if norm_name and len(norm_name) >= 3:
                phrases.add(norm_name)

            for p in phrases:
                if p not in self.keyword_index:
                    self.keyword_index[p] = []
                if code not in self.keyword_index[p]:
                    self.keyword_index[p].append(code)

    def match_label_text(
        self,
        raw_text: str,
    ) -> Tuple[Optional[str], str, float, bool, List[str]]:
        """Match label text against personal database using explainable hierarchy.

        Returns:
            (matched_sku, match_type, confidence_score, is_ambiguous, candidate_skus)

        Hierarchy:
        1. Exact Canonical Match (confidence = 1.0)
        2. Saved User Decision Match (confidence = 0.98)
        3. Exact Keyword / Alias Match (confidence = 0.90)
        4. Multi-token / Phrase Match (confidence = 0.80)
        5. Ambiguity Check (if 2+ SKUs match with close confidence)
        """
        if not raw_text:
            return None, "no_text", 0.0, False, []

        norm_label = normalize_text(raw_text)
        label_words = set(norm_label.split())
        label_upper = raw_text.upper()

        # -------------------------------------------------------------
        # Level 1: Saved User Decision Match
        # -------------------------------------------------------------
        # Exact snippet lookup or substring lookup from previous seller confirmations
        if norm_label in self.decisions_map:
            chosen = self.decisions_map[norm_label]
            return chosen, "saved_decision", 0.99, False, [chosen]

        for saved_snippet, chosen in self.decisions_map.items():
            if len(saved_snippet) >= 6 and saved_snippet in norm_label:
                return chosen, "saved_decision_partial", 0.95, False, [chosen]

        # -------------------------------------------------------------
        # Level 2: Exact Canonical Match
        # -------------------------------------------------------------
        canonical_matches: List[str] = []
        for code_upper, original_code in self.canonical_map.items():
            # Check whole word match in upper text
            pattern = r"(?<![A-Za-z0-9])" + re.escape(code_upper) + r"(?![A-Za-z0-9])"
            if re.search(pattern, label_upper):
                canonical_matches.append(original_code)

        if len(canonical_matches) == 1:
            return canonical_matches[0], "exact_canonical", 1.0, False, canonical_matches
        elif len(canonical_matches) > 1:
            # Ambiguity: Multiple distinct canonical SKUs present on one label!
            return canonical_matches[0], "exact_canonical_ambiguous", 0.85, True, canonical_matches

        # -------------------------------------------------------------
        # Level 3: Exact Keyword / Alias Match
        # -------------------------------------------------------------
        keyword_hits: Dict[str, int] = {}  # sku_code -> match score
        matched_phrases: Dict[str, List[str]] = {}

        for phrase, sku_list in self.keyword_index.items():
            # Exact phrase boundary check in normalized text
            p_pattern = r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])"
            if re.search(p_pattern, norm_label):
                phrase_weight = len(phrase.split()) * 10
                for code in sku_list:
                    keyword_hits[code] = keyword_hits.get(code, 0) + phrase_weight
                    if code not in matched_phrases:
                        matched_phrases[code] = []
                    matched_phrases[code].append(phrase)

        if keyword_hits:
            # Sort candidate SKUs by hit weight descending
            sorted_candidates = sorted(keyword_hits.items(), key=lambda x: -x[1])
            best_code, best_score = sorted_candidates[0]

            # Ambiguity check: Is there a second candidate with an identical or close score?
            competing = [c for c, score in sorted_candidates if score >= best_score * 0.85]
            if len(competing) > 1:
                return best_code, "keyword_ambiguous", 0.75, True, competing

            return best_code, "exact_keyword", 0.90, False, [best_code]

        # -------------------------------------------------------------
        # Level 4: Multi-Token Match (All words in phrase appear in label)
        # -------------------------------------------------------------
        token_hits: Dict[str, int] = {}
        for phrase, sku_list in self.keyword_index.items():
            tokens = phrase.split()
            if len(tokens) >= 2:  # Only multi-word phrases
                if all(t in label_words for t in tokens):
                    for code in sku_list:
                        token_hits[code] = token_hits.get(code, 0) + len(tokens) * 5

        if token_hits:
            sorted_tokens = sorted(token_hits.items(), key=lambda x: -x[1])
            best_code, best_score = sorted_tokens[0]
            competing = [c for c, score in sorted_tokens if score >= best_score * 0.9]
            if len(competing) > 1:
                return best_code, "token_match_ambiguous", 0.70, True, competing
            return best_code, "multi_token_match", 0.80, False, [best_code]

        # No match found in user's personal database
        return None, "unmatched", 0.0, False, []
