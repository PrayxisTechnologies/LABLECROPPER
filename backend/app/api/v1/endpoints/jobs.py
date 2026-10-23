"""Job management, seller history, and ambiguity resolution endpoints."""

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
import fitz

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db
from app.schemas.decision import ResolveAmbiguityRequest
from app.schemas.processing import (
    CourierSummary,
    DownloadLinks,
    ExtractedSKU,
    ProcessingConfig,
    ProcessingJobResponse,
    SortCriterion,
)
from app.services.pdf.courier_sorter import courier_sorter_service
from app.services.pdf.cropper import pdf_cropper_service
from app.services.picklist.generator import get_main_sku_group, picklist_generator_service
from app.services.sku_intelligence.engine import normalize_text

router = APIRouter()
settings = get_settings()


@router.get(
    "/jobs/history",
    summary="Get user job processing history",
    description="Retrieve past processing jobs and downloads for the authenticated seller.",
)
async def get_job_history(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve paginated processing history for current user."""
    db = get_db()
    if db is None:
        return {"items": [], "total": 0, "page": page, "size": size}

    user_id = str(current_user["_id"])
    query = {"user_id": user_id}
    total = await db.processing_jobs.count_documents(query)
    skip = (page - 1) * size

    cursor = db.processing_jobs.find(query).sort("created_at", -1).skip(skip).limit(size)

    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "job_id": doc.get("job_id"),
            "status": doc.get("status", "completed"),
            "created_at": doc.get("created_at"),
            "total_files": doc.get("total_files", 0),
            "total_labels_generated": doc.get("total_labels_generated", 0),
            "courier_breakdown": doc.get("courier_breakdown", []),
            "main_skus": doc.get("main_skus", []),
            "downloads": doc.get("downloads", {}),
            "google_drive": doc.get("google_drive", {}),
            "has_ambiguity": doc.get("has_ambiguity", False),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
    }


@router.post(
    "/labels/jobs/{job_id}/resolve-ambiguity",
    response_model=ProcessingJobResponse,
    summary="Resolve ambiguous labels in a job",
    description="Applies user-selected SKU confirmations, persists rules, and re-compiles 4x6 PDF & picklist.",
)
async def resolve_job_ambiguity(
    job_id: str,
    payload: ResolveAmbiguityRequest,
    current_user: dict = Depends(get_current_user),
) -> ProcessingJobResponse:
    """Resolve ambiguous SKUs for a processing job and re-render artifacts."""
    job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found or storage expired.",
        )

    labels_file = job_dir / "candidate_labels.json"
    report_file = job_dir / "processing_report.json"
    if not labels_file.exists() or not report_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job candidate records not found.",
        )

    # 1. Persist user decisions and user SKUs (Key and Value)
    db = get_db()
    user_id = str(current_user["_id"])
    now = datetime.now(timezone.utc)

    for res in payload.resolutions:
        clean_chosen = res.chosen_sku.strip()
        keyword_val = (res.matching_keyword or res.chosen_sku or res.raw_product_text).strip()
        norm_keyword = normalize_text(keyword_val)
        norm_raw = normalize_text(res.raw_product_text)

        if db is not None:
            # 1. Save or update decision rules for both keyword and raw text
            if norm_keyword:
                await db.sku_decisions.update_one(
                    {"user_id": user_id, "normalized_product_text": norm_keyword},
                    {
                        "$set": {
                            "user_id": user_id,
                            "raw_product_text": keyword_val,
                            "normalized_product_text": norm_keyword,
                            "chosen_sku": clean_chosen,
                            "created_at": now,
                            "job_id": job_id,
                        }
                    },
                    upsert=True,
                )
            if norm_raw and norm_raw != norm_keyword:
                await db.sku_decisions.update_one(
                    {"user_id": user_id, "normalized_product_text": norm_raw},
                    {
                        "$set": {
                            "user_id": user_id,
                            "raw_product_text": res.raw_product_text.strip(),
                            "normalized_product_text": norm_raw,
                            "chosen_sku": clean_chosen,
                            "created_at": now,
                            "job_id": job_id,
                        }
                    },
                    upsert=True,
                )

            # 2. Save Key and Value to user's personal SKU database (user_skus)
            # Default values and user choices are always saved!
            kw_list = [k for k in [keyword_val, clean_chosen, res.raw_product_text.strip()] if k]
            existing_sku = await db.user_skus.find_one({
                "user_id": user_id,
                "sku_code": {"$regex": f"^{re.escape(clean_chosen)}$", "$options": "i"},
            })
            if existing_sku:
                await db.user_skus.update_one(
                    {"_id": existing_sku["_id"]},
                    {
                        "$addToSet": {
                            "keywords": {"$each": kw_list}
                        },
                        "$set": {
                            "updated_at": now,
                            "is_active": True,
                        }
                    }
                )
            else:
                unique_kws: List[str] = []
                for k in kw_list:
                    if k not in unique_kws:
                        unique_kws.append(k)

                await db.user_skus.insert_one({
                    "user_id": user_id,
                    "sku_code": clean_chosen,
                    "product_name": clean_chosen,
                    "keywords": unique_kws,
                    "aliases": [],
                    "priority": 0,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                })

    # 2. Load stored candidate labels and previous report
    with open(labels_file, "r", encoding="utf-8") as f:
        stored_candidates = json.load(f)

    with open(report_file, "r", encoding="utf-8") as f:
        previous_report_data = json.load(f)
    config = ProcessingConfig.model_validate(previous_report_data.get("config", {}))

    # 3. Apply resolved SKUs to matching candidate labels
    active_labels: List[Dict] = []
    for c in stored_candidates:
        raw_sku_text = c.get("raw_sku") or ""
        raw_page_text = c.get("raw_text") or ""
        norm_c_sku = normalize_text(raw_sku_text)
        norm_c_text = normalize_text(raw_page_text)

        existing_assigned = [
            normalize_text(s.get("sku", "") if isinstance(s, dict) else str(s))
            for s in c.get("sku_items", [])
        ]
        existing_main_groups = [
            normalize_text(get_main_sku_group(s.get("sku", "") if isinstance(s, dict) else str(s)))
            for s in c.get("sku_items", [])
        ]

        matched_resolution_sku: Optional[str] = None

        for res in payload.resolutions:
            clean_chosen = res.chosen_sku.strip()
            keyword_val = (res.matching_keyword or res.chosen_sku or res.raw_product_text).strip()
            norm_kw = normalize_text(keyword_val)
            norm_raw_prod = normalize_text(res.raw_product_text)

            is_match = False
            # 1. Match against existing assigned SKU names or Main SKU families
            if norm_raw_prod and (norm_raw_prod in existing_main_groups or norm_raw_prod in existing_assigned):
                is_match = True
            elif norm_kw and (norm_kw in existing_main_groups or norm_kw in existing_assigned):
                is_match = True
            # 2. Check keyword match in raw_sku or page text (e.g. 'GREEN' in 'RSPK GREEN 001' or 'RSPK GREEN 2939')
            elif norm_kw and (norm_kw in norm_c_sku or norm_kw in norm_c_text):
                is_match = True
            elif norm_raw_prod and (norm_raw_prod in norm_c_sku or norm_raw_prod in norm_c_text):
                is_match = True
            elif keyword_val.upper() in raw_sku_text.upper() or keyword_val.upper() in raw_page_text.upper():
                is_match = True

            if is_match:
                matched_resolution_sku = clean_chosen
                break

        sku_items = []
        for s in c.get("sku_items", []):
            if isinstance(s, dict):
                sku_items.append(ExtractedSKU(**s))
            else:
                sku_items.append(ExtractedSKU(sku=str(s)))

        if matched_resolution_sku:
            resolved_sku = ExtractedSKU(
                sku=matched_resolution_sku,
                quantity=sku_items[0].quantity if sku_items else 1,
                order_id=c.get("order_id"),
                match_type="user_confirmed",
                confidence=1.0,
            )
            sku_items = [resolved_sku]
            c["raw_sku"] = matched_resolution_sku

        c["sku_items"] = sku_items
        c["crop_box"] = fitz.Rect(*c["crop_box"])
        active_labels.append(c)

    # Persist updated candidate labels to disk so subsequent edits stay cumulative
    try:
        candidate_labels_serializable = []
        for c_lbl in active_labels:
            crop = c_lbl["crop_box"]
            candidate_labels_serializable.append({
                "filename": c_lbl["filename"],
                "pno": c_lbl["pno"],
                "crop_box": [crop.x0, crop.y0, crop.x1, crop.y1] if hasattr(crop, "x0") else crop,
                "courier_partner": c_lbl["courier_partner"],
                "wbl_id": c_lbl.get("wbl_id"),
                "order_id": c_lbl["order_id"],
                "raw_sku": c_lbl.get("raw_sku"),
                "sku_items": [
                    si.model_dump() if hasattr(si, "model_dump") else si
                    for si in c_lbl.get("sku_items", [])
                ],
                "is_flagged": c_lbl.get("is_flagged", False),
                "review_reason": c_lbl.get("review_reason"),
                "original_index": c_lbl["original_index"],
                "raw_text": c_lbl.get("raw_text", ""),
            })
        with open(labels_file, "w", encoding="utf-8") as f:
            json.dump(candidate_labels_serializable, f, indent=2)
    except Exception as save_err:
        logger.warning("Could not persist updated candidate labels for job %s: %s", job_id, str(save_err))

    # 4. Filter candidate labels based on user exclusions before sorting
    excluded_main_set = {s.strip().upper() for s in (config.excluded_main_skus or []) if s.strip()}
    excluded_sku_set = {s.strip().upper() for s in (config.excluded_skus or []) if s.strip()}
    excluded_courier_set = {s.strip().upper() for s in (config.excluded_couriers or []) if s.strip()}

    filtered_labels: List[Dict] = []
    for lbl in active_labels:
        courier_name = (lbl.get("courier_partner") or "Unassigned").strip().upper()
        if courier_name in excluded_courier_set:
            continue

        s_items = lbl.get("sku_items") or []
        if s_items:
            primary_sku = getattr(s_items[0], "sku", str(s_items[0])).strip()
            main_sku = get_main_sku_group(primary_sku).strip().upper()
            if main_sku in excluded_main_set:
                continue

            if any(getattr(si, "sku", str(si)).strip().upper() in excluded_sku_set for si in s_items):
                continue
        else:
            if "UNMATCHED" in excluded_main_set or "UNMATCHED" in excluded_sku_set:
                continue

        filtered_labels.append(lbl)

    # 4b. Re-sort filtered labels
    if config.sort_by == SortCriterion.COURIER:
        sorted_labels = courier_sorter_service.sort_by_courier(filtered_labels)
    elif config.sort_by == SortCriterion.SKU:
        sorted_labels = courier_sorter_service.sort_by_sku(filtered_labels)
    elif config.sort_by == SortCriterion.SKU_COURIER:
        sorted_labels = courier_sorter_service.sort_by_sku_and_courier(filtered_labels)
    else:
        sorted_labels = sorted(filtered_labels, key=lambda x: x.get("original_index", 0))

    # 5. Re-render 4x6 thermal PDF
    output_doc = fitz.open()
    open_docs: Dict[str, fitz.Document] = {}

    try:
        # Map source documents
        for item in sorted_labels:
            fname = item["filename"]
            if fname not in open_docs:
                src_path = None
                # Search for buffered source file
                for f in job_dir.glob(f"src_*_{fname}"):
                    src_path = f
                    break
                if src_path and src_path.exists():
                    open_docs[fname] = fitz.open(str(src_path))

        for item in sorted_labels:
            src_doc = open_docs.get(item["filename"])
            if src_doc:
                pdf_cropper_service.place_label_on_thermal_page(
                    src_doc=src_doc,
                    src_page_num=item["pno"],
                    crop_box=item["crop_box"],
                    target_doc=output_doc,
                )

        output_pdf_path = job_dir / "labels_thermal_4x6.pdf"
        output_doc.save(str(output_pdf_path), garbage=0, deflate=False)
    finally:
        output_doc.close()
        for doc in open_docs.values():
            try:
                doc.close()
            except Exception:
                pass

    # 6. Re-generate SKU Picklist CSV
    should_generate_picklist = (
        config.enable_sku_picklist
        or config.sort_by in (SortCriterion.SKU, SortCriterion.SKU_COURIER)
    )
    picklist_items = []
    if should_generate_picklist:
        picklist_items, csv_str = picklist_generator_service.build_picklist(sorted_labels)
        with open(job_dir / "sku_picklist.csv", "w", encoding="utf-8") as f:
            f.write(csv_str)

    # 7. Re-calculate SKU groupings
    raw_label_summary_items = [
        {
            "courier": lbl.get("courier_partner") or "Unassigned",
            "order_id": lbl.get("order_id"),
            "sku_items": lbl.get("sku_items") or [],
        }
        for lbl in sorted_labels
    ]
    main_skus, all_skus = picklist_generator_service.group_skus_for_inspection(
        raw_label_summary_items
    )

    courier_counts: Dict[str, int] = {}
    for label in sorted_labels:
        c_name = label.get("courier_partner") or "Unassigned"
        courier_counts[c_name] = courier_counts.get(c_name, 0) + 1

    courier_breakdown: List[CourierSummary] = []
    total_labels = len(sorted_labels)
    for c_name, count in sorted(courier_counts.items(), key=lambda x: -x[1]):
        pct = round((count / total_labels * 100), 1) if total_labels > 0 else 0.0
        courier_breakdown.append(
            CourierSummary(courier=c_name, label_count=count, percentage=pct)
        )

    api_prefix = settings.API_V1_PREFIX
    downloads = DownloadLinks(
        thermal_pdf=f"{api_prefix}/labels/jobs/{job_id}/download/pdf",
        picklist_csv=f"{api_prefix}/labels/jobs/{job_id}/download/picklist" if should_generate_picklist else None,
        report_json=f"{api_prefix}/labels/jobs/{job_id}/download/report",
    )

    updated_response = ProcessingJobResponse(
        job_id=job_id,
        status="completed",
        created_at=datetime.now(timezone.utc),
        config=config,
        total_files=previous_report_data.get("total_files", 1),
        total_input_pages=previous_report_data.get("total_input_pages", total_labels),
        total_labels_generated=total_labels,
        total_invoices_removed=previous_report_data.get("total_invoices_removed", 0),
        total_pages_flagged=0,
        courier_breakdown=courier_breakdown,
        main_skus=main_skus,
        all_skus=all_skus,
        picklist_items=picklist_items,
        pages=[],
        warnings=["Ambiguity resolved with user confirmations."],
        has_ambiguity=False,
        ambiguous_labels=[],
        downloads=downloads,
    )

    # Overwrite report on disk
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(updated_response.model_dump_json(indent=2))

    # Update Job record in MongoDB
    if db is not None:
        try:
            await db.processing_jobs.update_one(
                {"job_id": job_id, "user_id": user_id},
                {
                    "$set": {
                        "status": "completed",
                        "has_ambiguity": False,
                        "ambiguous_labels": [],
                        "main_skus": [m.model_dump() for m in main_skus],
                        "all_skus": [a.model_dump() for a in all_skus],
                        "courier_breakdown": [c.model_dump() for c in courier_breakdown],
                        "picklist_items": [p.model_dump() for p in picklist_items],
                        "updated_at": now,
                    }
                }
            )
        except Exception as e_db:
            logger.warning("Failed to update job %s in processing_jobs: %s", job_id, str(e_db))

    # Update Master Sheet with newly resolved SKUs and label positions
    try:
        from app.services.master_sheet.service import master_sheet_service
        from app.services.pdf.waybill_extractor import detect_marketplace
        marketplace = detect_marketplace(sorted_labels[0].get("raw_text", "")) if sorted_labels else "Meesho"
        fn_file = job_dir / "formatted_name.txt"
        custom_pdf_name = fn_file.read_text(encoding="utf-8").strip() if fn_file.exists() else None
        await master_sheet_service.record_batch_labels(
            user_id=user_id,
            job_id=job_id,
            labels=sorted_labels,
            marketplace=marketplace,
            custom_pdf_name=custom_pdf_name,
        )
    except Exception as m_err:
        logger.warning("Failed to update Master Sheet after ambiguity resolution: %s", str(m_err))

    return updated_response


@router.delete(
    "/jobs/{job_id}",
    summary="Delete processing job from history",
    description="Deletes job record from MongoDB and cleans up any local artifact files.",
)
async def delete_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a user processing job record."""
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable.",
        )

    user_id = str(current_user["_id"])
    result = await db.processing_jobs.delete_one({"job_id": job_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found or you are not authorized to delete it.",
        )

    # Cascade delete associated labels from Master Sheet
    try:
        from app.services.master_sheet.service import master_sheet_service
        await master_sheet_service.delete_job_labels(user_id=user_id, job_id=job_id)
        await master_sheet_service.cleanup_orphaned_labels(user_id=user_id)
    except Exception as m_err:
        logger.warning("Failed to cascade delete Master Sheet labels for job %s: %s", job_id, str(m_err))

    # Clean up local storage directory if exists
    try:
        job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id
        if job_dir.exists() and job_dir.is_dir():
            shutil.rmtree(job_dir, ignore_errors=True)
    except Exception as exc:
        logger.warning("Could not delete local storage for job %s: %s", job_id, str(exc))

    logger.info("User %s deleted job record %s", user_id, job_id)
    return {"message": "Job deleted successfully."}
