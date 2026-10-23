"""LabelFlow batch PDF processing orchestrator with Smart SKU Intelligence."""

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
    ExtractedSKU,
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

    # 1. Check for known colors
    found_colors: List[str] = []
    for c in COLOR_KEYWORDS:
        if re.search(rf"\b{c}\b", upper_raw) or (c in upper_raw and len(c) >= 4):
            if c not in found_colors:
                found_colors.append(c)

    # 2. Tokenize by space, underscore, dash, slash, dot
    raw_tokens = [t.strip() for t in re.split(r"[\s_\-\/\.]+", clean_raw) if len(t.strip()) >= 2]
    # Filter pure digits
    word_tokens = [t for t in raw_tokens if not t.isdigit()]

    candidates: List[str] = []

    # Priority A: Colors (e.g. GREEN, BROWN)
    for fc in found_colors:
        if fc not in candidates:
            candidates.append(fc)

    # Priority B: Individual significant words (e.g. RSPK, Rospack)
    for wt in word_tokens:
        if wt.upper() not in [c.upper() for c in candidates]:
            candidates.append(wt)

    # Priority C: Multi-word combinations (e.g. "RSPK GREEN")
    if len(word_tokens) >= 2:
        combo = " ".join(word_tokens[:2])
        if combo.upper() not in [c.upper() for c in candidates]:
            candidates.append(combo)

    # Priority D: Full original SKU
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

        # Keep open source fitz documents mapped by filename to render after sorting
        open_docs: Dict[str, fitz.Document] = {}

        try:
            for f_idx, file in enumerate(files):
                filename = file.filename or f"upload_{f_idx+1}.pdf"

                # 1. Structural validation
                validation_item, raw_bytes = await pdf_validator_service.validate_uploaded_file(file)
                if not validation_item.is_valid:
                    warnings.append(
                        f"File '{filename}' skipped: {', '.join(validation_item.errors)}"
                    )
                    continue

                # 2. Persist to disk buffer to prevent PyMuPDF memory stream segfaults & reduce RAM
                disk_file_path = job_dir / f"src_{f_idx}_{filename}"
                try:
                    with open(disk_file_path, "wb") as f_out:
                        f_out.write(raw_bytes)
                    del raw_bytes  # Immediate free memory
                    src_doc = fitz.open(str(disk_file_path))
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
                        inspection.full_text
                    )
                    raw_sku = sku_items[0].sku if sku_items else "UNMATCHED"

                    is_ambiguous = False
                    candidates: List[str] = []
                    matched_sku: Optional[str] = None
                    matched_kw: Optional[str] = None

                    if sku_engine:
                        matched_sku, match_type, conf, is_ambiguous, candidates = (
                            sku_engine.match_label_text(inspection.full_text)
                        )
                        if matched_sku:
                            intel_sku = ExtractedSKU(
                                sku=matched_sku,
                                quantity=sku_items[0].quantity if sku_items else 1,
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
                            matched_sku = default_sku
                            matched_kw = default_kw
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
                        if config.remove_invoice and can_remove_invoice:
                            is_invoice_removed = True
                            total_invoices_removed += 1
                        else:
                            is_label_extracted = True
                            if not can_remove_invoice:
                                is_flagged = True
                                review_reason = safety_reason
                                total_pages_flagged += 1
                                warnings.append(
                                    f"[{filename} p.{pno+1}] Invoice page retained: {safety_reason}"
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
                                "raw_text": inspection.full_text[:400],
                            })

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
                                "raw_text": inspection.full_text[:400],
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
                                "raw_text": inspection.full_text[:400],
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
                            "raw_text": inspection.full_text[:400],
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
                            dimensions_pt=[round(inspection.width, 1), round(inspection.height, 1)],
                        )
                    )

            # 4. Filter candidate labels based on user exclusions
            excluded_main_set = {s.strip().upper() for s in (config.excluded_main_skus or []) if s.strip()}
            excluded_sku_set = {s.strip().upper() for s in (config.excluded_skus or []) if s.strip()}
            excluded_courier_set = {s.strip().upper() for s in (config.excluded_couriers or []) if s.strip()}

            active_labels: List[Dict] = []
            for lbl in candidate_labels:
                courier_name = (lbl.get("courier_partner") or "Unassigned").strip().upper()
                if courier_name in excluded_courier_set:
                    continue

                sku_items = lbl.get("sku_items") or []
                if sku_items:
                    primary_sku = getattr(sku_items[0], "sku", str(sku_items[0])).strip()
                    main_sku = get_main_sku_group(primary_sku).strip().upper()
                    if main_sku in excluded_main_set:
                        continue

                    # Check individual SKU variant exclusions
                    if any(getattr(si, "sku", str(si)).strip().upper() in excluded_sku_set for si in sku_items):
                        continue
                else:
                    if "UNMATCHED" in excluded_main_set or "UNMATCHED" in excluded_sku_set:
                        continue

                active_labels.append(lbl)

            if len(active_labels) < len(candidate_labels):
                warnings.append(
                    f"User filter applied: {len(candidate_labels) - len(active_labels)} label(s) excluded from output PDF."
                )

            # 4b. Deterministic Sorting on active labels
            if config.sort_by == SortCriterion.COURIER:
                sorted_labels = courier_sorter_service.sort_by_courier(active_labels)
            elif config.sort_by == SortCriterion.SKU:
                sorted_labels = courier_sorter_service.sort_by_sku(active_labels)
            elif config.sort_by == SortCriterion.SKU_COURIER:
                sorted_labels = courier_sorter_service.sort_by_sku_and_courier(active_labels)
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

            # 7b. Group SKUs into Main SKUs (e.g. BROWN, GREEN) and All Sub-SKUs
            raw_label_summary_items = [
                {
                    "courier": lbl.get("courier_partner") or "Unassigned",
                    "order_id": lbl.get("order_id"),
                    "sku_items": lbl.get("sku_items") or [],
                }
                for lbl in candidate_labels
            ]
            main_skus, all_skus = picklist_generator_service.group_skus_for_inspection(
                raw_label_summary_items
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
                    count = await db.processing_jobs.count_documents(q)
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
                main_skus=main_skus,
                all_skus=all_skus,
                picklist_items=picklist_items,
                pages=page_records,
                warnings=warnings,
                has_ambiguity=len(ambiguous_labels) > 0,
                ambiguous_labels=ambiguous_labels,
                formatted_filename=formatted_pdf_name,
                downloads=downloads,
            )

            # 10. Save JSON Audit Report to Disk
            report_path = job_dir / "processing_report.json"
            with open(report_path, "w", encoding="utf-8") as f:
                f.write(job_response.model_dump_json(indent=2))

            # 11. Save candidate labels metadata for ambiguity recompilation
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
                })
            with open(job_dir / "candidate_labels.json", "w", encoding="utf-8") as f:
                json.dump(candidate_labels_serializable, f)

            # 12. Persist processing job in MongoDB for authenticated user history
            if user_id:
                try:
                    db = get_db()
                    if db is not None:
                        await db.processing_jobs.insert_one({
                            "job_id": job_id,
                            "user_id": user_id,
                            "marketplace": clean_mp,
                            "formatted_filename": formatted_pdf_name,
                            "status": job_response.status,
                            "created_at": created_at,
                            "total_files": len(files),
                            "total_labels_generated": total_labels_generated,
                            "total_invoices_removed": total_invoices_removed,
                            "courier_breakdown": [c.model_dump() for c in courier_breakdown],
                            "main_skus": [m.model_dump() for m in main_skus],
                            "downloads": downloads.model_dump(),
                            "has_ambiguity": len(ambiguous_labels) > 0,
                        })

                        # 12b. Automatically save detected Main SKUs and sub-SKUs into Personal SKU Database
                        now_utc = datetime.now(timezone.utc)
                        for m in main_skus:
                            m_code = m.main_sku.strip()
                            if m_code and m_code.upper() != "UNMATCHED":
                                sub_kws = [s.sku.strip() for s in m.sub_skus if s.sku and s.sku.upper() != "UNMATCHED"]
                                all_kws = list(dict.fromkeys([m_code] + sub_kws))

                                existing = await db.user_skus.find_one({
                                    "user_id": user_id,
                                    "sku_code": {"$regex": f"^{re.escape(m_code)}$", "$options": "i"},
                                })
                                if existing:
                                    await db.user_skus.update_one(
                                        {"_id": existing["_id"]},
                                        {
                                            "$addToSet": {"keywords": {"$each": all_kws}},
                                            "$set": {"updated_at": now_utc},
                                        }
                                    )
                                else:
                                    await db.user_skus.insert_one({
                                        "user_id": user_id,
                                        "sku_code": m_code,
                                        "product_name": m_code,
                                        "keywords": all_kws,
                                        "aliases": [],
                                        "priority": 0,
                                        "is_active": True,
                                        "created_at": now_utc,
                                        "updated_at": now_utc,
                                    })
                except Exception as e:
                    logger.warning("Failed to persist job record to MongoDB: %s", str(e))

                # 13. Update seller Master Sheet (Deduplicated strictly by Order ID)
                try:
                    await master_sheet_service.record_batch_labels(
                        user_id=user_id,
                        job_id=job_id,
                        labels=sorted_labels,
                        marketplace=clean_mp,
                        custom_pdf_name=formatted_pdf_name,
                    )
                except Exception as m_err:
                    logger.warning("Failed to update Master Sheet for job %s: %s", job_id, str(m_err))

                # 14. Auto-backup to user's Google Drive in marketplace folder if connected
                try:
                    db = get_db()
                    if db is not None:
                        user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
                        if user_doc and user_doc.get("google_drive", {}).get("connected"):
                            auto_save = user_doc.get("settings", {}).get("auto_save_to_drive", True)
                            if auto_save:
                                from app.services.google.drive import google_drive_service
                                drive_res = await google_drive_service.backup_job_to_drive(
                                    user_id, job_id, marketplace=clean_mp, custom_pdf_name=formatted_pdf_name
                                )
                                if drive_res.get("success"):
                                    f_url = drive_res.get("folder_url")
                                    p_url = drive_res.get("pdf_drive_url")
                                    csv_url = drive_res.get("picklist_drive_url")
                                    job_response.downloads.google_drive_folder = f_url
                                    job_response.downloads.google_drive_pdf = p_url
                                    job_response.downloads.google_drive_picklist = csv_url
                except Exception as g_err:
                    logger.warning("Auto Google Drive backup skipped or failed: %s", str(g_err))

            logger.info(
                "Job %s completed: %d labels, %d invoices removed, %d flagged",
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


batch_processor = PDFBatchProcessor()
