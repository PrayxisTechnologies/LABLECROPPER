"""LabelFlow batch PDF processing orchestrator with Smart SKU Intelligence."""

import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import UploadFile
import fitz  # PyMuPDF

from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db
from app.schemas.decision import AmbiguousLabelItem
from app.schemas.processing import (
    CourierSummary,
    DownloadLinks,
    DuplicateLabelItem,
    ExtractedSKU,
    MarketplaceSummary,
    PageProcessingRecord,
    PicklistItem,
    ProcessingConfig,
    ProcessingJobResponse,
    SortCriterion,
)
from app.services.pdf.courier_sorter import courier_sorter_service
from app.services.pdf.cropper import pdf_cropper_service
from app.services.pdf.inspector import pdf_inspector
from app.services.master_sheet.service import master_sheet_service
from app.services.pdf.invoice_detector import invoice_detector_service
from app.services.pdf.validator import pdf_validator_service
from app.services.pdf.waybill_extractor import detect_marketplace, extract_waybill_id
from app.services.picklist.generator import COLOR_KEYWORDS, get_main_sku_group, picklist_generator_service
from app.services.sku_intelligence.engine import SKUIntelligenceEngine


def extract_smart_sku_candidates(raw_sku: str) -> Tuple[str, str, List[str]]:
    """Smart candidate keyword generator for unrecognized SKUs.

    Returns (default_sku_name, default_keyword, candidates_list).
    """
    clean_raw = raw_sku.strip()
    upper_raw = clean_raw.upper()

    # 1. Tokenize by space, underscore, dash, slash, dot
    raw_tokens = [t.strip() for t in re.split(r"[\s_\-\/\.]+", clean_raw) if len(t.strip()) >= 2]
    # Filter pure digits
    word_tokens = [t for t in raw_tokens if not t.isdigit()]

    # 2. Check for known colors
    found_colors: List[str] = []
    for c in COLOR_KEYWORDS:
        if re.search(rf"\b{c}\b", upper_raw) or (c in upper_raw and len(c) >= 4):
            if c not in found_colors:
                found_colors.append(c)

    candidates: List[str] = []

    # Priority A: If first token is a brand/product word (e.g. 'Rospack' in 'Rospack Brown 80ml'), it takes top priority
    if word_tokens:
        first_w = word_tokens[0]
        first_w_upper = first_w.upper()
        is_first_color = any(
            c == first_w_upper or (len(c) >= 4 and c in first_w_upper)
            for c in COLOR_KEYWORDS
        )
        if not is_first_color:
            candidates.append(first_w)
            if len(word_tokens) >= 2:
                combo = f"{first_w} {word_tokens[1]}"
                if combo.upper() not in [c.upper() for c in candidates]:
                    candidates.append(combo)

    # Priority B: Colors (e.g. GREEN, BROWN)
    for fc in found_colors:
        if fc.upper() not in [c.upper() for c in candidates]:
            candidates.append(fc)

    # Priority C: Remaining individual significant words (e.g. RSPK, Rospack)
    for wt in word_tokens:
        if wt.upper() not in [c.upper() for c in candidates]:
            candidates.append(wt)

    # Priority D: Multi-word combinations (e.g. "RSPK GREEN")
    if len(word_tokens) >= 2:
        combo = " ".join(word_tokens[:2])
        if combo.upper() not in [c.upper() for c in candidates]:
            candidates.append(combo)

    # Priority E: Full original SKU
    if clean_raw.upper() not in [c.upper() for c in candidates]:
        candidates.append(clean_raw)

    default_sku = candidates[0] if candidates else clean_raw
    default_keyword = candidates[0] if candidates else clean_raw

    return default_sku, default_keyword, candidates


class PDFBatchProcessor:
    """Orchestrates end-to-end processing of Meesho PDF shipping label batches."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def process_batch(
        self,
        files: List[UploadFile],
        config: ProcessingConfig,
        user_skus: Optional[List[Dict[str, Any]]] = None,
        user_decisions: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[str] = None,
        marketplace: Optional[str] = None,
        recent_job_ids: Optional[List[str]] = None,
    ) -> ProcessingJobResponse:
        """Execute full Phase 2 processing workflow across uploaded files with SKU intelligence."""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        created_at = datetime.now(timezone.utc)

        # Setup persistent job storage directory
        base_storage = Path(self.settings.STORAGE_DIR)
        job_dir = base_storage / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        logger.info(
            "Initiating processing job %s with %d files (authenticated: %s)",
            job_id,
            len(files),
            bool(user_id),
        )

        # Build reference lookup of previously processed orders (populated via high-speed targeted batch query)
        previous_orders_map: Dict[str, Dict[str, Any]] = {}
        db = get_db()

        # Initialize SKU intelligence engine if user SKUs are provided
        sku_engine: Optional[SKUIntelligenceEngine] = None
        if user_skus:
            sku_engine = SKUIntelligenceEngine(
                user_skus=user_skus,
                user_decisions=user_decisions,
            )

        total_input_pages = 0
        total_invoices_removed = 0
        total_pages_flagged = 0
        warnings: List[str] = []

        # Intermediate records for sorting and generation
        candidate_labels: List[Dict] = []
        page_records: List[PageProcessingRecord] = []
        ambiguous_labels: List[AmbiguousLabelItem] = []
        seen_ambiguous_signatures: Set[str] = set()
        detected_duplicates: List[DuplicateLabelItem] = []
        seen_duplicate_keys: Set[str] = set()

        # Keep open source fitz documents mapped by filename to render after sorting
        open_docs: Dict[str, fitz.Document] = {}
        open_docs_bytes: Dict[str, bytes] = {}
        sku_match_cache: Dict[str, Tuple[Optional[str], str, float, bool, List[str]]] = {}
        sku_main_cache: Dict[str, str] = {}

        try:
            # 1. High-Speed Concurrent File Upload Validation & Buffer Read
            validation_results = await asyncio.gather(
                *(pdf_validator_service.validate_uploaded_file(f) for f in files)
            )

            for f_idx, (file, (validation_item, raw_bytes)) in enumerate(zip(files, validation_results)):
                filename = file.filename or f"upload_{f_idx+1}.pdf"

                if not validation_item.is_valid:
                    warnings.append(
                        f"File '{filename}' skipped: {', '.join(validation_item.errors)}"
                    )
                    continue

                disk_file_path = job_dir / f"src_{f_idx}_{filename}"
                try:
                    # Persist raw bytes to disk buffer for persistent job downloads
                    with open(disk_file_path, "wb") as f_out:
                        f_out.write(raw_bytes)
                    open_docs_bytes[filename] = raw_bytes
                    src_doc = fitz.open(stream=raw_bytes, filetype="pdf")
                    open_docs[filename] = src_doc
                except Exception as e:
                    warnings.append(f"Unable to read PDF file for '{filename}': {str(e)}")
                    continue

                file_page_count = len(src_doc)
                total_input_pages += file_page_count

                # 3. Inspect every page
                for pno in range(file_page_count):
                    src_page = src_doc[pno]
                    inspection = pdf_inspector.inspect_page(src_page, pno)

                    # Extract courier
                    courier, confidence = courier_sorter_service.detect_courier(
                        text=inspection.full_text,
                        header_text=inspection.top_half_text,
                    )

                    # Extract Waybill / AWB tracking ID (e.g. 'VL0085864655841')
                    wbl_id = extract_waybill_id(inspection.full_text, courier)

                    # Extract SKUs using Smart Intelligence or fallback regex
                    sku_items, order_id = picklist_generator_service.extract_skus(
                        inspection.full_text,
                        known_wbl_id=wbl_id,
                    )
                    raw_sku = sku_items[0].sku if sku_items else "UNMATCHED"

                    is_ambiguous = False
                    candidates: List[str] = []
                    matched_sku: Optional[str] = None
                    matched_kw: Optional[str] = None

                    if sku_engine:
                        cache_key = raw_sku if raw_sku != "UNMATCHED" else inspection.full_text[:300]
                        if cache_key in sku_match_cache:
                            matched_sku, match_type, conf, is_ambiguous, candidates = sku_match_cache[cache_key]
                        else:
                            matched_sku, match_type, conf, is_ambiguous, candidates = (
                                sku_engine.match_label_text(
                                    inspection.full_text,
                                    candidate_sku=raw_sku if raw_sku != "UNMATCHED" else None,
                                )
                            )
                            sku_match_cache[cache_key] = (matched_sku, match_type, conf, is_ambiguous, candidates)

                        if matched_sku:
                            intel_sku = ExtractedSKU(
                                sku=raw_sku if raw_sku != "UNMATCHED" else matched_sku,
                                quantity=sku_items[0].quantity if sku_items else 1,
                                description=matched_sku,
                                order_id=order_id,
                                match_type=match_type,
                                confidence=conf,
                            )
                            # Set matched user SKU as the single clean label SKU
                            sku_items = [intel_sku]
                        elif sku_items:
                            # User has active SKUs, but this product is NEW/UNRECOGNIZED (e.g. 'RSPK BROWN 001')
                            raw_sku_text = sku_items[0].sku
                            default_sku, default_kw, candidates = extract_smart_sku_candidates(raw_sku_text)
                            is_ambiguous = True
                            matched_sku = "UNKNOWN"
                            matched_kw = default_kw
                            intel_sku = ExtractedSKU(
                                sku=raw_sku,
                                quantity=sku_items[0].quantity,
                                description="UNKNOWN",
                                order_id=order_id,
                                match_type="unrecognized",
                                confidence=0.0,
                            )
                            sku_items = [intel_sku]
                    elif user_id and sku_items and raw_sku != "UNMATCHED":
                        # User is logged in, but has no saved SKUs yet:
                        # Parse candidates so user can confirm new SKU and save to personal database
                        raw_sku_text = sku_items[0].sku
                        default_sku, default_kw, candidates = extract_smart_sku_candidates(raw_sku_text)
                        is_ambiguous = True
                        matched_sku = default_sku
                        matched_kw = default_kw

                    is_label_extracted = False
                    is_invoice_removed = False
                    is_flagged = inspection.is_flagged_for_review
                    review_reason = inspection.review_reason

                    # Safety check on invoice removal
                    can_remove_invoice, safety_reason = (
                        invoice_detector_service.can_safely_remove_invoice(inspection)
                    )

                    # Case A: Standalone Tax Invoice page
                    if inspection.layout_type == "tax_invoice":
                        if config.remove_invoice:
                            is_invoice_removed = True
                            total_invoices_removed += 1
                        else:
                            # User unchecked remove_invoice: invoice is kept in file, but NEVER treated as a shipping label
                            warnings.append(
                                f"[{filename} p.{pno+1}] Standalone invoice page retained as requested."
                            )

                    # Case B: Split page (Top Label, Bottom Invoice)
                    elif inspection.layout_type == "split_label_invoice":
                        if config.remove_invoice and can_remove_invoice:
                            is_label_extracted = True
                            is_invoice_removed = True
                            total_invoices_removed += 1
                            crop_box = inspection.label_rect or fitz.Rect(0, 0, inspection.width, inspection.height * 0.52)

                            candidate_labels.append({
                                "filename": filename,
                                "pno": pno,
                                "crop_box": crop_box,
                                "courier_partner": courier,
                                "wbl_id": wbl_id,
                                "order_id": order_id,
                                "raw_sku": raw_sku,
                                "sku_items": sku_items,
                                "is_flagged": False,
                                "review_reason": None,
                                "original_index": len(candidate_labels),
                                "raw_text": inspection.full_text[:2000],
                                "marketplace": getattr(inspection, "marketplace", "Meesho") or "Meesho",
                            })
                        else:
                            is_label_extracted = True
                            is_flagged = True
                            total_pages_flagged += 1
                            review_reason = safety_reason or "Split layout invoice could not be safely isolated."
                            warnings.append(
                                f"[{filename} p.{pno+1}] Preserved full page: {review_reason}"
                            )

                            candidate_labels.append({
                                "filename": filename,
                                "pno": pno,
                                "crop_box": fitz.Rect(0, 0, inspection.width, inspection.height),
                                "courier_partner": courier,
                                "wbl_id": wbl_id,
                                "order_id": order_id,
                                "raw_sku": raw_sku,
                                "sku_items": sku_items,
                                "is_flagged": is_flagged,
                                "review_reason": review_reason,
                                "original_index": len(candidate_labels),
                                "raw_text": inspection.full_text[:2000],
                                "marketplace": getattr(inspection, "marketplace", "Meesho") or "Meesho",
                            })

                    # Case C: Full shipping label or ambiguous page
                    else:
                        is_label_extracted = True
                        if inspection.is_flagged_for_review or not inspection.label_rect:
                            total_pages_flagged += 1
                            warnings.append(
                                f"[{filename} p.{pno+1}] Ambiguous page layout: {inspection.review_reason}"
                            )
                            crop_box = fitz.Rect(0, 0, inspection.width, inspection.height)
                        else:
                            crop_box = inspection.label_rect

                        candidate_labels.append({
                            "filename": filename,
                            "pno": pno,
                            "crop_box": crop_box,
                            "courier_partner": courier,
                            "wbl_id": wbl_id,
                            "order_id": order_id,
                            "raw_sku": raw_sku,
                            "sku_items": sku_items,
                            "is_flagged": inspection.is_flagged_for_review,
                            "review_reason": inspection.review_reason,
                            "original_index": len(candidate_labels),
                            "raw_text": inspection.full_text[:2000],
                            "marketplace": getattr(inspection, "marketplace", "Meesho") or "Meesho",
                        })

                    if is_label_extracted and is_ambiguous and candidates:
                        raw_sku_val = sku_items[0].sku if sku_items else (raw_sku if raw_sku != "UNMATCHED" else "")
                        suggested_kw = matched_kw or (candidates[0] if candidates else (matched_sku or raw_sku_val))
                        suggested_sku = matched_sku or (candidates[0] if candidates else raw_sku_val)
                        sig = (suggested_kw or suggested_sku or raw_sku_val).strip().upper()

                        if sig and sig not in seen_ambiguous_signatures:
                            seen_ambiguous_signatures.add(sig)
                            ambiguous_labels.append(
                                AmbiguousLabelItem(
                                    label_index=len(candidate_labels) - 1,
                                    filename=filename,
                                    page_number=pno + 1,
                                    raw_text_snippet=raw_sku_val or (candidates[0] if candidates else "UNKNOWN"),
                                    original_sku=raw_sku_val or (candidates[0] if candidates else "UNKNOWN"),
                                    detected_candidates=candidates,
                                    chosen_sku=suggested_sku,
                                    matching_keyword=suggested_kw,
                                )
                            )

                    # If SKU sorting is active and no SKU was detected, flag as unmatched
                    if (
                        is_label_extracted
                        and not sku_items
                        and config.sort_by in (SortCriterion.SKU, SortCriterion.SKU_COURIER)
                    ):
                        if not is_flagged:
                            is_flagged = True
                            total_pages_flagged += 1
                        unmatched_msg = "SKU could not be automatically extracted; preserved as UNMATCHED"
                        review_reason = f"{review_reason}; {unmatched_msg}" if review_reason else unmatched_msg
                        warnings.append(
                            f"[{filename} p.{pno+1}] SKU extraction failed; preserved as UNMATCHED."
                        )

                    # Record page result
                    page_records.append(
                        PageProcessingRecord(
                            input_filename=filename,
                            page_number=pno + 1,
                            page_type=inspection.layout_type,
                            is_label_extracted=is_label_extracted,
                            is_invoice_removed=is_invoice_removed,
                            is_flagged_for_review=is_flagged,
                            review_reason=review_reason,
                            courier_partner=courier,
                            courier_confidence=confidence,
                            sku_items=sku_items,
                            marketplace=getattr(inspection, "marketplace", "Meesho") or "Meesho",
                            dimensions_pt=[
                                round(inspection.label_rect.width + 20.0, 1) if inspection.label_rect else round(inspection.width, 1),
                                round(inspection.label_rect.height + 20.0, 1) if inspection.label_rect else round(inspection.height, 1),
                            ],
                        )
                    )

            # 3b. High-Speed Targeted Duplicate Check (Only queries exact order IDs in this batch)
            batch_order_ids = {
                (c.get("order_id") or "").strip().upper()
                for c in candidate_labels
                if (c.get("order_id") or "").strip()
            }
            batch_wbl_ids = {
                (c.get("wbl_id") or "").strip().upper()
                for c in candidate_labels
                if (c.get("wbl_id") or "").strip()
            }

            if user_id and db is not None and (batch_order_ids or batch_wbl_ids):
                try:
                    or_queries = []
                    if batch_order_ids:
                        or_queries.append({"order_id": {"$in": list(batch_order_ids)}})
                    if batch_wbl_ids:
                        or_queries.append({"wbl_id": {"$in": list(batch_wbl_ids)}})

                    user_clauses = [{"user_id": str(user_id)}]
                    try:
                        user_clauses.append({"user_id": ObjectId(user_id)})
                    except Exception:
                        pass

                    dup_query = {
                        "$and": [
                            {"$or": user_clauses},
                            {"$or": or_queries},
                            {"is_trashed": {"$ne": True}},
                        ]
                    }
                    async def _fetch_master_duplicates():
                        cursor = db.master_labels.find(
                            dup_query,
                            projection={
                                "order_id": 1,
                                "wbl_id": 1,
                                "sku": 1,
                                "courier_partner": 1,
                                "appearances": 1,
                                "last_processed_at": 1,
                            },
                        ).limit(600)
                        async for m_doc in cursor:
                            apps = [a for a in m_doc.get("appearances", []) if not a.get("is_trashed")]
                            if not apps:
                                continue
                            prev_app = apps[-1]
                            ord_id = (m_doc.get("order_id") or "").strip().upper()
                            w_id = (m_doc.get("wbl_id") or "").strip().upper()
                            info = {
                                "order_id": m_doc.get("order_id"),
                                "wbl_id": m_doc.get("wbl_id"),
                                "sku": m_doc.get("sku") or "UNMATCHED",
                                "courier": m_doc.get("courier_partner") or "Unassigned",
                                "previous_job_id": prev_app.get("job_id"),
                                "previous_filename": prev_app.get("pdf_filename") or prev_app.get("input_filename"),
                                "previous_processed_at": m_doc.get("last_processed_at") or prev_app.get("created_at"),
                            }
                            if ord_id:
                                previous_orders_map[ord_id] = info
                            if w_id:
                                previous_orders_map[w_id] = info

                    await asyncio.wait_for(_fetch_master_duplicates(), timeout=1.2)
                except Exception as e_ms:
                    logger.warning("Error fetching master_labels for duplicate check: %s", str(e_ms))
            elif recent_job_ids and (batch_order_ids or batch_wbl_ids):
                for r_job_id in recent_job_ids[:5]:
                    if not r_job_id or r_job_id == job_id:
                        continue
                    if (base_storage / "jobs" / r_job_id / "trashed.txt").exists():
                        continue
                    r_cand_file = base_storage / "jobs" / r_job_id / "candidate_labels.json"
                    if not r_cand_file.exists():
                        continue
                    try:
                        with open(r_cand_file, "r", encoding="utf-8") as cf:
                            cands = json.load(cf)
                            for c_item in cands:
                                c_ord = (c_item.get("order_id") or "").strip().upper()
                                c_wbl = (c_item.get("wbl_id") or "").strip().upper()
                                if (c_ord and c_ord in batch_order_ids) or (c_wbl and c_wbl in batch_wbl_ids):
                                    cand_info = {
                                        "order_id": c_item.get("order_id"),
                                        "wbl_id": c_item.get("wbl_id"),
                                        "sku": c_item.get("raw_sku") or "UNMATCHED",
                                        "courier": c_item.get("courier_partner") or "Unassigned",
                                        "previous_job_id": r_job_id,
                                        "previous_filename": f"{r_job_id}.pdf",
                                        "previous_processed_at": None,
                                    }
                                    if c_ord and c_ord not in previous_orders_map:
                                        previous_orders_map[c_ord] = cand_info
                                    if c_wbl and c_wbl not in previous_orders_map:
                                        previous_orders_map[c_wbl] = cand_info
                    except Exception:
                        pass

            # Detect duplicates for all candidate labels
            for c in candidate_labels:
                clean_ord = (c.get("order_id") or "").strip().upper()
                clean_wbl = (c.get("wbl_id") or "").strip().upper()
                dup_info = previous_orders_map.get(clean_ord) or previous_orders_map.get(clean_wbl)
                if dup_info:
                    dup_key = f"{clean_ord}_{clean_wbl}_{c.get('filename')}_{c.get('pno')}"
                    if dup_key not in seen_duplicate_keys:
                        seen_duplicate_keys.add(dup_key)
                        detected_duplicates.append(
                            DuplicateLabelItem(
                                order_id=c.get("order_id") or dup_info.get("order_id") or f"AWB_{clean_wbl}",
                                wbl_id=clean_wbl or dup_info.get("wbl_id"),
                                sku=c.get("raw_sku") if c.get("raw_sku") != "UNMATCHED" else (dup_info.get("sku") or "UNMATCHED"),
                                courier=c.get("courier_partner") if c.get("courier_partner") != "Unassigned" else (dup_info.get("courier") or "Unassigned"),
                                input_filename=c.get("filename"),
                                page_number=c.get("pno", 0) + 1,
                                previous_job_id=dup_info.get("previous_job_id"),
                                previous_filename=dup_info.get("previous_filename"),
                                previous_processed_at=dup_info.get("previous_processed_at"),
                            )
                        )

            # 4. Filter candidate labels based on user exclusions
            excluded_main_set = {s.strip().upper() for s in (config.excluded_main_skus or []) if s.strip()}
            excluded_sku_set = {s.strip().upper() for s in (config.excluded_skus or []) if s.strip()}
            excluded_courier_set = {s.strip().upper() for s in (config.excluded_couriers or []) if s.strip()}
            excluded_order_set = {str(s).strip().upper() for s in (config.excluded_order_ids or []) if str(s).strip()}
            excluded_mp_set = {s.strip().upper() for s in (config.excluded_marketplaces or []) if s.strip()}

            active_labels: List[Dict] = []
            for lbl in candidate_labels:
                # Check Marketplace exclusion
                lbl_mp = (lbl.get("marketplace") or "Meesho").strip().upper()
                if lbl_mp in excluded_mp_set:
                    continue

                # Check Order ID or Waybill exclusion
                lbl_ord = (lbl.get("order_id") or "").strip().upper()
                lbl_wbl = (lbl.get("wbl_id") or "").strip().upper()
                if (lbl_ord and lbl_ord in excluded_order_set) or (lbl_wbl and lbl_wbl in excluded_order_set):
                    continue

                courier_name = (lbl.get("courier_partner") or "Unassigned").strip().upper()
                if courier_name in excluded_courier_set:
                    continue

                sku_items = lbl.get("sku_items") or []
                if sku_items:
                    primary_sku = getattr(sku_items[0], "sku", str(sku_items[0])).strip()
                    parent_desc = getattr(sku_items[0], "description", None)
                    if parent_desc and str(parent_desc).strip() and str(parent_desc).strip().upper() not in ("UNMATCHED", "UNKNOWN", "UNKNOWN SKUS", "OTHER"):
                        main_sku = str(parent_desc).strip().upper()
                    else:
                        clean_main_key = primary_sku.strip().upper()
                        if clean_main_key in sku_main_cache:
                            main_sku = sku_main_cache[clean_main_key]
                        else:
                            main_sku = get_main_sku_group(
                                primary_sku,
                                sku_engine=sku_engine,
                                user_skus=user_skus,
                                full_text=lbl.get("raw_text", ""),
                                smart_sku_detection=getattr(config, "smart_sku_detection", False),
                            ).strip().upper()
                            sku_main_cache[clean_main_key] = main_sku
                    lbl["main_sku"] = main_sku
                    if main_sku in excluded_main_set:
                        continue

                    # Check individual SKU variant exclusions
                    if any(getattr(si, "sku", str(si)).strip().upper() in excluded_sku_set for si in sku_items):
                        continue
                else:
                    lbl["main_sku"] = "UNMATCHED"
                    if "UNMATCHED" in excluded_main_set or "UNMATCHED" in excluded_sku_set:
                        continue

                active_labels.append(lbl)

            if len(active_labels) < len(candidate_labels):
                warnings.append(
                    f"User filter applied: {len(candidate_labels) - len(active_labels)} label(s) excluded from output PDF."
                )

            # Calculate duplicate label metrics
            total_labels_detected = len(candidate_labels)
            total_detected_duplicates = len(detected_duplicates)

            excluded_duplicates_count = 0
            unexcluded_duplicates: List[DuplicateLabelItem] = []
            for d in detected_duplicates:
                d_ord = (d.order_id or "").strip().upper()
                d_wbl = (d.wbl_id or "").strip().upper()
                if (d_ord and d_ord in excluded_order_set) or (d_wbl and d_wbl in excluded_order_set):
                    excluded_duplicates_count += 1
                else:
                    unexcluded_duplicates.append(d)

            has_duplicates = len(unexcluded_duplicates) > 0
            all_labels_duplicate = (
                total_labels_detected > 0
                and total_detected_duplicates == total_labels_detected
                and excluded_duplicates_count == 0
            )

            # 4b. Deterministic Sorting on active labels
            if config.sort_by == SortCriterion.COURIER:
                sorted_labels = courier_sorter_service.sort_by_courier(active_labels)
            elif config.sort_by == SortCriterion.SKU:
                sorted_labels = courier_sorter_service.sort_by_sku(active_labels)
            elif config.sort_by == SortCriterion.SKU_COURIER:
                sorted_labels = courier_sorter_service.sort_by_sku_and_courier(active_labels)
            elif config.sort_by == SortCriterion.MARKETPLACE:
                sorted_labels = courier_sorter_service.sort_by_marketplace(active_labels)
            elif config.sort_by == SortCriterion.MARKETPLACE_SKU_COURIER:
                sorted_labels = courier_sorter_service.sort_by_marketplace_sku_courier(active_labels)
            elif config.sort_by == SortCriterion.MARKETPLACE_COURIER:
                sorted_labels = courier_sorter_service.sort_by_marketplace_courier(active_labels)
            elif config.sort_by == SortCriterion.SKU_MARKETPLACE_COURIER:
                sorted_labels = courier_sorter_service.sort_by_sku_marketplace_courier(active_labels)
            elif config.sort_by == SortCriterion.COURIER_SKU_MARKETPLACE:
                sorted_labels = courier_sorter_service.sort_by_courier_sku_marketplace(active_labels)
            elif config.sort_by == SortCriterion.COURIER_MARKETPLACE_SKU:
                sorted_labels = courier_sorter_service.sort_by_courier_marketplace_sku(active_labels)
            elif config.sort_by == SortCriterion.SKU_COURIER_MARKETPLACE:
                sorted_labels = courier_sorter_service.sort_by_sku_courier_marketplace(active_labels)
            else:
                sorted_labels = sorted(active_labels, key=lambda x: x.get("original_index", 0))

            # 5. Generate Target 4x6 Thermal PDF (O(1) dictionary mapped)
            output_doc = fitz.open()
            rec_map = {
                (pr.input_filename, pr.page_number): pr
                for pr in page_records
            }
            for idx, label_info in enumerate(sorted_labels):
                src_doc = open_docs[label_info["filename"]]
                pdf_cropper_service.place_label_on_thermal_page(
                    src_doc=src_doc,
                    src_page_num=label_info["pno"],
                    crop_box=label_info["crop_box"],
                    target_doc=output_doc,
                )
                matched_rec = rec_map.get((label_info["filename"], label_info["pno"] + 1))
                if matched_rec:
                    matched_rec.output_page_index = idx + 1

            total_labels_generated = len(output_doc)
            if total_labels_generated == 0:
                empty_page = output_doc.new_page(width=288.0, height=432.0)
                empty_page.insert_text(
                    fitz.Point(30, 200),
                    "No shipping labels were extracted from the uploaded batch.",
                    fontsize=10,
                )
                warnings.append("No shipping labels were extracted from the uploaded document(s).")

            output_pdf_path = job_dir / "labels_thermal_4x6.pdf"
            output_doc.save(str(output_pdf_path), garbage=0, deflate=False)
            output_doc.close()

            # 6. Generate SKU Picklist CSV
            should_generate_picklist = (
                config.enable_sku_picklist
                or config.sort_by in (SortCriterion.SKU, SortCriterion.SKU_COURIER)
            )
            picklist_items: List[PicklistItem] = []
            picklist_csv_path = job_dir / "sku_picklist.csv"
            if should_generate_picklist:
                picklist_items, csv_str = picklist_generator_service.build_picklist(
                    sorted_labels
                )
                with open(picklist_csv_path, "w", encoding="utf-8") as f:
                    f.write(csv_str)

            # 7. Courier Breakdown Aggregation
            courier_counts: Dict[str, int] = {}
            for label in sorted_labels:
                c_name = label.get("courier_partner") or "Unassigned"
                courier_counts[c_name] = courier_counts.get(c_name, 0) + 1

            courier_breakdown: List[CourierSummary] = []
            for c_name, count in sorted(courier_counts.items(), key=lambda x: -x[1]):
                pct = round((count / total_labels_generated * 100), 1) if total_labels_generated > 0 else 0.0
                courier_breakdown.append(
                    CourierSummary(
                        courier=c_name,
                        label_count=count,
                        percentage=pct,
                    )
                )

            # 7a. Marketplace Breakdown Aggregation
            mp_counts: Dict[str, int] = {}
            for label in sorted_labels:
                m_name = (label.get("marketplace") or "Meesho").capitalize()
                mp_counts[m_name] = mp_counts.get(m_name, 0) + 1

            marketplace_breakdown: List[MarketplaceSummary] = []
            for m_name, count in sorted(mp_counts.items(), key=lambda x: -x[1]):
                pct = round((count / total_labels_generated * 100), 1) if total_labels_generated > 0 else 0.0
                marketplace_breakdown.append(
                    MarketplaceSummary(
                        marketplace=m_name,
                        label_count=count,
                        percentage=pct,
                    )
                )

            # 7b. Group SKUs into Main SKUs (e.g. BROWN, GREEN) and All Sub-SKUs
            raw_label_summary_items = [
                {
                    "courier": lbl.get("courier_partner") or "Unassigned",
                    "order_id": lbl.get("order_id"),
                    "sku_items": lbl.get("sku_items") or [],
                    "raw_text": lbl.get("raw_text", ""),
                }
                for lbl in candidate_labels
            ]
            main_skus, all_skus = picklist_generator_service.group_skus_for_inspection(
                raw_label_summary_items,
                sku_engine=sku_engine,
                user_skus=user_skus,
                smart_sku_detection=getattr(config, "smart_sku_detection", False),
            )

            # 8. Marketplace detection & Platform-Specific Sequence Naming ({platform}{seq}prayxis.pdf)
            detected_mp = "Meesho"
            if sorted_labels:
                sample_text = (files[0].filename or "") + " " + sorted_labels[0].get("raw_text", "")
                detected_mp = detect_marketplace(sample_text, files[0].filename or "")

            clean_mp = (marketplace or detected_mp).capitalize()
            mp_slug = clean_mp.lower()

            seq_num = 1
            db = get_db()
            if db is not None:
                try:
                    q: Dict[str, Any] = {"marketplace": clean_mp}
                    if user_id:
                        q["user_id"] = user_id
                    count = await asyncio.wait_for(db.processing_jobs.count_documents(q), timeout=0.3)
                    seq_num = count + 1
                except Exception:
                    seq_num = 1

            formatted_pdf_name = f"{mp_slug}{seq_num}prayxis.pdf"

            try:
                (job_dir / "formatted_name.txt").write_text(formatted_pdf_name, encoding="utf-8")
            except Exception:
                pass

            # 9. Download URLs
            api_prefix = self.settings.API_V1_PREFIX
            downloads = DownloadLinks(
                thermal_pdf=f"{api_prefix}/labels/jobs/{job_id}/download/pdf",
                picklist_csv=f"{api_prefix}/labels/jobs/{job_id}/download/picklist" if should_generate_picklist else None,
                report_json=f"{api_prefix}/labels/jobs/{job_id}/download/report",
            )

            # Construct Response Model
            job_response = ProcessingJobResponse(
                job_id=job_id,
                status="completed" if total_pages_flagged == 0 else "partial",
                created_at=created_at,
                config=config,
                total_files=len(files),
                total_input_pages=total_input_pages,
                total_labels_generated=total_labels_generated,
                total_invoices_removed=total_invoices_removed,
                total_pages_flagged=total_pages_flagged,
                courier_breakdown=courier_breakdown,
                marketplace_breakdown=marketplace_breakdown,
                main_skus=main_skus,
                all_skus=all_skus,
                picklist_items=picklist_items,
                pages=page_records,
                warnings=warnings,
                has_ambiguity=len(ambiguous_labels) > 0,
                ambiguous_labels=ambiguous_labels,
                has_duplicates=has_duplicates,
                all_labels_duplicate=all_labels_duplicate,
                duplicate_labels=unexcluded_duplicates,
                excluded_duplicates_count=excluded_duplicates_count,
                formatted_filename=formatted_pdf_name,
                marketplace=clean_mp,
                downloads=downloads,
            )

            # 10. Async Background Disk & DB Persistence (Never blocks HTTP response)
            orig_filenames = [f.filename for f in files if f.filename]
            asyncio.create_task(
                self._persist_job_artifacts_and_master_background(
                    job_dir=job_dir,
                    job_response=job_response,
                    candidate_labels=candidate_labels,
                    user_id=user_id,
                    job_id=job_id,
                    clean_mp=clean_mp,
                    formatted_pdf_name=formatted_pdf_name,
                    job_status=job_response.status,
                    created_at=created_at,
                    total_files=len(files),
                    total_labels_generated=total_labels_generated,
                    total_invoices_removed=total_invoices_removed,
                    courier_breakdown=courier_breakdown,
                    main_skus=main_skus,
                    downloads=downloads,
                    ambiguous_labels=ambiguous_labels,
                    sorted_labels=sorted_labels,
                    original_filenames=orig_filenames,
                )
            )

            logger.info(
                "Job %s completed in fast pipeline: %d labels, %d invoices removed, %d flagged",
                job_id,
                total_labels_generated,
                total_invoices_removed,
                total_pages_flagged,
            )

            return job_response

        finally:
            # Safely close all PyMuPDF documents to prevent memory leaks
            for doc in open_docs.values():
                try:
                    doc.close()
                except Exception:
                    pass

    async def _persist_job_artifacts_and_master_background(
        self,
        job_dir: Path,
        job_response: ProcessingJobResponse,
        candidate_labels: List[Dict[str, Any]],
        user_id: Optional[str],
        job_id: str,
        clean_mp: str,
        formatted_pdf_name: str,
        job_status: str,
        created_at: datetime,
        total_files: int,
        total_labels_generated: int,
        total_invoices_removed: int,
        courier_breakdown: List[Any],
        main_skus: List[Any],
        downloads: Any,
        ambiguous_labels: List[Any],
        sorted_labels: List[Dict[str, Any]],
        original_filenames: Optional[List[str]] = None,
    ) -> None:
        """Background asynchronous persistence for JSON reports, MongoDB job history, and Master Sheet."""
        # 1. Non-blocking disk reports
        try:
            report_path = job_dir / "processing_report.json"
            report_path.write_text(job_response.model_dump_json(), encoding="utf-8")

            candidate_labels_serializable = []
            for c in candidate_labels:
                crop = c["crop_box"]
                candidate_labels_serializable.append({
                    "filename": c["filename"],
                    "pno": c["pno"],
                    "crop_box": [crop.x0, crop.y0, crop.x1, crop.y1],
                    "courier_partner": c["courier_partner"],
                    "wbl_id": c.get("wbl_id"),
                    "order_id": c["order_id"],
                    "raw_sku": c.get("raw_sku"),
                    "sku_items": [
                        si.model_dump() if hasattr(si, "model_dump") else si
                        for si in c.get("sku_items", [])
                    ],
                    "original_index": c["original_index"],
                    "raw_text": c.get("raw_text", ""),
                    "marketplace": c.get("marketplace", "Meesho"),
                })
            with open(job_dir / "candidate_labels.json", "w", encoding="utf-8") as f:
                json.dump(candidate_labels_serializable, f)
        except Exception as e_rep:
            logger.warning("Background report writing error for job %s: %s", job_id, str(e_rep))
        try:
            db = get_db()
            if db is not None and user_id:
                await db.processing_jobs.insert_one({
                    "job_id": job_id,
                    "user_id": user_id,
                    "marketplace": clean_mp,
                    "formatted_filename": formatted_pdf_name,
                    "status": job_status,
                    "created_at": created_at,
                    "total_files": total_files,
                    "total_labels_generated": total_labels_generated,
                    "total_invoices_removed": total_invoices_removed,
                    "courier_breakdown": [c.model_dump() if hasattr(c, "model_dump") else c for c in courier_breakdown],
                    "main_skus": [m.model_dump() if hasattr(m, "model_dump") else m for m in main_skus],
                    "downloads": downloads.model_dump() if hasattr(downloads, "model_dump") else downloads,
                    "has_ambiguity": len(ambiguous_labels) > 0,
                    "original_filenames": original_filenames or [],
                })

                # Mark any matching cloud queue files as printed!
                if original_filenames:
                    await db.cloud_label_queue.update_many(
                        {
                            "user_id": user_id,
                            "filename": {"$in": original_filenames},
                        },
                        {
                            "$set": {
                                "status": "printed",
                                "printed_at": created_at,
                                "job_id": job_id,
                            }
                        },
                    )

                now_utc = datetime.now(timezone.utc)
                for m in main_skus:
                    m_code = (getattr(m, "main_sku", None) or (m.get("main_sku") if isinstance(m, dict) else "")).strip()
                    if m_code and m_code.upper() != "UNMATCHED":
                        sub_skus_list = getattr(m, "sub_skus", []) or (m.get("sub_skus", []) if isinstance(m, dict) else [])
                        sub_kws = [
                            (getattr(s, "sku", None) or (s.get("sku") if isinstance(s, dict) else str(s))).strip()
                            for s in sub_skus_list
                            if (getattr(s, "sku", None) or (s.get("sku") if isinstance(s, dict) else str(s))).strip().upper() != "UNMATCHED"
                        ]
                        all_kws = list(dict.fromkeys(sub_kws))
                        if all_kws:
                            await db.user_skus.update_one(
                                {
                                    "user_id": user_id,
                                    "sku_code": {"$regex": f"^{re.escape(m_code)}$", "$options": "i"},
                                },
                                {
                                    "$addToSet": {"keywords": {"$each": all_kws}},
                                    "$set": {"updated_at": now_utc},
                                },
                            )
        except Exception as e:
            logger.warning("Failed to persist job record to MongoDB in background: %s", str(e))

        try:
            await master_sheet_service.record_batch_labels(
                user_id=user_id,
                job_id=job_id,
                labels=sorted_labels,
                marketplace=clean_mp,
                custom_pdf_name=formatted_pdf_name,
                job_created_at=created_at,
            )
        except Exception as m_err:
            logger.warning("Failed to update Master Sheet for job %s: %s", job_id, str(m_err))


batch_processor = PDFBatchProcessor()
