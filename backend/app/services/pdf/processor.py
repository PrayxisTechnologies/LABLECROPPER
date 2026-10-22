"""LabelFlow batch PDF processing orchestrator."""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from fastapi import UploadFile
import fitz  # PyMuPDF

from app.core.config import get_settings
from app.core.logging import logger
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
from app.services.pdf.cropper import pdf_cropper_service
from app.services.pdf.courier_sorter import courier_sorter_service
from app.services.pdf.inspector import pdf_inspector
from app.services.pdf.invoice_detector import invoice_detector_service
from app.services.pdf.validator import pdf_validator_service
from app.services.picklist.generator import picklist_generator_service


class PDFBatchProcessor:
    """Orchestrates end-to-end processing of Meesho PDF shipping label batches."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def process_batch(
        self,
        files: List[UploadFile],
        config: ProcessingConfig,
    ) -> ProcessingJobResponse:
        """Execute full Phase 2 processing workflow across uploaded files."""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        created_at = datetime.now(timezone.utc)

        # Setup persistent job storage directory
        base_storage = Path(self.settings.STORAGE_DIR)
        job_dir = base_storage / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Initiating processing job %s with %d files", job_id, len(files))

        total_input_pages = 0
        total_invoices_removed = 0
        total_pages_flagged = 0
        warnings: List[str] = []

        # Intermediate records for sorting and generation
        candidate_labels: List[Dict] = []
        page_records: List[PageProcessingRecord] = []

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

                    # Extract courier and SKUs
                    courier, confidence = courier_sorter_service.detect_courier(
                        text=inspection.full_text,
                        header_text=inspection.top_half_text,
                    )
                    sku_items, order_id = picklist_generator_service.extract_skus(
                        inspection.full_text
                    )

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
                            # Excluded from thermal label stream
                        else:
                            # Cannot safely remove or removal disabled -> preserve page
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
                                "order_id": order_id,
                                "sku_items": sku_items,
                                "is_flagged": is_flagged,
                                "review_reason": review_reason,
                                "original_index": len(candidate_labels),
                            })

                    # Case B: Split page (Top Label, Bottom Invoice)
                    elif inspection.layout_type == "split_label_invoice":
                        if config.remove_invoice and can_remove_invoice:
                            is_label_extracted = True
                            is_invoice_removed = True
                            total_invoices_removed += 1
                            # Use precise detected shipping label boundary
                            crop_box = inspection.label_rect or fitz.Rect(0, 0, inspection.width, inspection.height * 0.52)

                            candidate_labels.append({
                                "filename": filename,
                                "pno": pno,
                                "crop_box": crop_box,
                                "courier_partner": courier,
                                "order_id": order_id,
                                "sku_items": sku_items,
                                "is_flagged": False,
                                "review_reason": None,
                                "original_index": len(candidate_labels),
                            })
                        else:
                            # Invoice removal not safe -> preserve entire page
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
                                "order_id": order_id,
                                "sku_items": sku_items,
                                "is_flagged": is_flagged,
                                "review_reason": review_reason,
                                "original_index": len(candidate_labels),
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
                            # Full shipping label: crop tightly to label bounds, removing lower blank region
                            crop_box = inspection.label_rect

                        candidate_labels.append({
                            "filename": filename,
                            "pno": pno,
                            "crop_box": crop_box,
                            "courier_partner": courier,
                            "order_id": order_id,
                            "sku_items": sku_items,
                            "is_flagged": inspection.is_flagged_for_review,
                            "review_reason": inspection.review_reason,
                            "original_index": len(candidate_labels),
                        })

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

            # 4. Deterministic Sorting
            if config.sort_by == SortCriterion.COURIER:
                sorted_labels = courier_sorter_service.sort_by_courier(candidate_labels)
            elif config.sort_by == SortCriterion.SKU:
                sorted_labels = courier_sorter_service.sort_by_sku(candidate_labels)
            elif config.sort_by == SortCriterion.SKU_COURIER:
                sorted_labels = courier_sorter_service.sort_by_sku_and_courier(candidate_labels)
            else:
                # Original input order
                sorted_labels = sorted(candidate_labels, key=lambda x: x.get("original_index", 0))

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
            # Picklist is generated when SKU/SKU+Courier sorting is chosen, or if user explicitly enabled it
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

            # 8. Download URLs
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
                downloads=downloads,
            )

            # 9. Save JSON Audit Report to Disk
            report_path = job_dir / "processing_report.json"
            with open(report_path, "w", encoding="utf-8") as f:
                f.write(job_response.model_dump_json(indent=2))

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
