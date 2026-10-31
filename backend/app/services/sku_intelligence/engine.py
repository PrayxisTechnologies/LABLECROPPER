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
        """Pre-index canonical codes, keywords, and decisions with strict length-first hierarchy."""
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

        # 3. Build unified indexed phrases list: (norm_phrase, sku_code, is_canonical, priority)
        # All saved phrases (SKU codes, keywords, aliases) are indexed and sorted so that longer,
        # more specific phrases (e.g. 'rospack 80ml') are evaluated strictly before shorter phrases ('rospack').
        self.all_phrases: List[Tuple[str, str, bool, int]] = []
        seen_phrase_sku: Set[Tuple[str, str]] = set()

        for s in self.user_skus:
            code = s.get("sku_code", "").strip()
            if not code:
                continue
            prio = int(s.get("priority", 0))

            # Canonical SKU code
            norm_code = normalize_text(code)
            if norm_code and (norm_code, code) not in seen_phrase_sku:
                self.all_phrases.append((norm_code, code, True, prio))
                seen_phrase_sku.add((norm_code, code))

            # Keywords
            for kw in s.get("keywords", []):
                norm_kw = normalize_text(kw)
                if norm_kw and (norm_kw, code) not in seen_phrase_sku:
                    self.all_phrases.append((norm_kw, code, False, prio))
                    seen_phrase_sku.add((norm_kw, code))

            # Aliases
            for alias in s.get("aliases", []):
                norm_al = normalize_text(alias)
                if norm_al and (norm_al, code) not in seen_phrase_sku:
                    self.all_phrases.append((norm_al, code, False, prio))
                    seen_phrase_sku.add((norm_al, code))

            # Product name
            norm_name = normalize_text(s.get("product_name", ""))
            if norm_name and len(norm_name) >= 3 and (norm_name, code) not in seen_phrase_sku:
                self.all_phrases.append((norm_name, code, False, prio))
                seen_phrase_sku.add((norm_name, code))

        # Sort all phrases: Longer token counts first, then longer character lengths, then canonical, then priority
        self.all_phrases.sort(
            key=lambda x: (len(x[0].split()), len(x[0]), 1 if x[2] else 0, x[3]),
            reverse=True,
        )

        # Keyword index mapping: phrase -> list of SKU codes
        self.keyword_index: Dict[str, List[str]] = {}
        for p, code, _, _ in self.all_phrases:
            if p not in self.keyword_index:
                self.keyword_index[p] = []
            if code not in self.keyword_index[p]:
                self.keyword_index[p].append(code)

    def match_label_text(
        self,
        raw_text: str,
        candidate_sku: Optional[str] = None,
    ) -> Tuple[Optional[str], str, float, bool, List[str]]:
        """Match label text and optional candidate SKU against user's saved database.

        Priority Hierarchy:
        1. Exact/Longest Phrase Match in Candidate SKU (e.g. 'rospack 80ml' > 'rospack', Confidence = 1.0)
        2. Exact/Longest Phrase Match in Full Label Text (Longest phrase first, Confidence = 0.98)
        3. Multi-token Word Match from user's saved SKUs (Confidence = 0.85)
        4. Specific Saved User Decisions (Confidence = 0.80)
        """
        # -------------------------------------------------------------
        # Level 0: Direct Targeted Candidate SKU Match
        # -------------------------------------------------------------
        if candidate_sku and candidate_sku.strip() and candidate_sku.strip().upper() != "UNMATCHED":
            cand_clean = candidate_sku.strip()
            norm_cand = normalize_text(cand_clean)
            cand_subtokens = set(t.lower() for t in re.findall(r"[A-Za-z]+|\d+", cand_clean))
            compact_cand = re.sub(r"[\s_\-\.\/]+", "", norm_cand)

            # Check all saved phrases strictly sorted longest-first
            for phrase, code, is_canonical, _ in self.all_phrases:
                p_pattern = r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])"
                compact_phrase = phrase.replace(" ", "")

                # 1. Exact phrase or standard word-boundary match
                if phrase == norm_cand or re.search(p_pattern, norm_cand):
                    m_type = "candidate_canonical" if is_canonical else "candidate_keyword"
                    return code, m_type, 1.0, False, [code]

                # 2. Sub-token boundary match (e.g. 'rspk10brown002' -> tokens ['rspk', '10', 'brown', '002'])
                if phrase in cand_subtokens or compact_phrase in cand_subtokens:
                    m_type = "candidate_token" if is_canonical else "candidate_keyword"
                    return code, m_type, 0.98, False, [code]

                # 3. Compact substring match for distinct keywords (e.g. 'brown' inside 'rspk10brown002' or 'po10green128')
                if len(compact_phrase) >= 4 and compact_phrase in compact_cand:
                    m_type = "candidate_submatch" if is_canonical else "candidate_keyword"
                    return code, m_type, 0.95, False, [code]

            # Multi-token candidate match (longer token sets first)
            cand_words = set(norm_cand.split())
            for phrase, code, _, _ in self.all_phrases:
                tokens = phrase.split()
                if len(tokens) >= 2 and all(t in cand_words or t in cand_subtokens for t in tokens):
                    return code, "candidate_tokens", 0.92, False, [code]

        if not raw_text:
            return None, "no_text", 0.0, False, []

        # Quarantine customer delivery address, return address, and courier blocks
        # so address names/streets never trigger SKU classification
        raw_lines = raw_text.splitlines()
        clean_lines = []
        skip_block = False
        for ln in raw_lines:
            ln_low = ln.lower().strip()
            if any(hdr in ln_low for hdr in ["ship to", "deliver to", "delivery address", "customer address", "buyer", "return to", "sold by", "blue dart"]):
                skip_block = True
                continue
            if any(hdr in ln_low for hdr in ["product", "sku", "item", "description", "order no", "sub order"]):
                skip_block = False
            if not skip_block:
                clean_lines.append(ln)

        isolated_raw = "\n".join(clean_lines) if clean_lines else raw_text
        norm_label = normalize_text(isolated_raw)
        label_words = set(norm_label.split())
        label_subtokens = set(t.lower() for t in re.findall(r"[A-Za-z]+|\d+", isolated_raw))
        compact_label = re.sub(r"[\s_\-\.\/]+", "", norm_label)

        # -------------------------------------------------------------
        # Level 1: Longest Saved Phrase Match in Label Text
        # -------------------------------------------------------------
        # Evaluates longest and most specific phrases first across both canonical codes and keywords
        # Single-word generic colors (e.g. 'green', 'brown', 'blue') are restricted to candidate_sku only
        GENERIC_COLORS = {"brown", "green", "black", "blue", "red", "pink", "white", "yellow", "grey", "gray", "orange", "gold", "silver"}
        for phrase, code, is_canonical, _ in self.all_phrases:
            # Prevent short/color words from matching inside addresses or surrounding text
            if phrase in GENERIC_COLORS or len(phrase) <= 4:
                continue

            p_pattern = r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])"
            compact_phrase = phrase.replace(" ", "")
            if re.search(p_pattern, norm_label):
                m_type = "exact_canonical" if is_canonical else "exact_keyword"
                return code, m_type, 0.98, False, [code]
            if phrase in label_subtokens or compact_phrase in label_subtokens:
                m_type = "token_canonical" if is_canonical else "token_keyword"
                return code, m_type, 0.95, False, [code]
            if len(compact_phrase) >= 4 and compact_phrase in compact_label:
                m_type = "submatch_canonical" if is_canonical else "submatch_keyword"
                return code, m_type, 0.92, False, [code]

        # -------------------------------------------------------------
        # Level 2: Multi-Token Match (All words in phrase appear in label)
        # -------------------------------------------------------------
        for phrase, code, _, _ in self.all_phrases:
            tokens = phrase.split()
            if len(tokens) >= 2:
                if all(t in label_words or t in label_subtokens for t in tokens):
                    return code, "multi_token_match", 0.85, False, [code]

        # -------------------------------------------------------------
        # Level 3: Saved User Decision Match (Strict boundaries only)
        # -------------------------------------------------------------
        if norm_label in self.decisions_map:
            chosen = self.decisions_map[norm_label]
            return chosen, "saved_decision", 0.90, False, [chosen]

        if candidate_sku:
            norm_cand_only = normalize_text(candidate_sku)
            if norm_cand_only in self.decisions_map:
                chosen = self.decisions_map[norm_cand_only]
                return chosen, "saved_decision_cand", 0.90, False, [chosen]

        for saved_snippet, chosen in self.decisions_map.items():
            if len(saved_snippet) >= 10:
                s_pattern = r"(?<![a-z0-9])" + re.escape(saved_snippet) + r"(?![a-z0-9])"
                if re.search(s_pattern, norm_label):
                    return chosen, "saved_decision_partial", 0.80, False, [chosen]

        return None, "unmatched", 0.0, False, []

    def find_parent_sku(
        self,
        sku_or_candidate: str,
        full_text: str = "",
    ) -> Optional[str]:
        """Resolve a parent Main SKU from user's personal database for a given SKU string or label text."""
        matched, _, conf, _, _ = self.match_label_text(
            raw_text=full_text,
            candidate_sku=sku_or_candidate,
        )
        return matched
