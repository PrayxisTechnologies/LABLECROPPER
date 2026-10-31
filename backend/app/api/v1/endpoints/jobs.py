"""Job management, seller history, and ambiguity resolution endpoints."""

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
import fitz

from app.api.deps import get_current_user, get_optional_current_user
from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db
from app.schemas.decision import ResolveAmbiguityRequest
from app.schemas.processing import (
    ClaimHistoryRequest,
    CourierSummary,
    DownloadLinks,
    ExtractedSKU,
    MarketplaceSummary,
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


def _find_storage_jobs_dir() -> Optional[Path]:
    """Find base jobs storage directory across possible working directories."""
    candidates = [
        Path(settings.STORAGE_DIR) / "jobs",
        Path(__file__).resolve().parent.parent.parent.parent / "storage" / "jobs",
        Path.cwd() / "backend" / "storage" / "jobs",
        Path.cwd() / "storage" / "jobs",
    ]
    for p in candidates:
        if p.exists() and p.is_dir():
            return p
    return None


def _find_job_dir(job_id: str) -> Optional[Path]:
    """Find specific job directory across possible storage locations."""
    if not job_id or not re.match(r"^[a-zA-Z0-9_\-]+$", job_id):
        return None
    candidates = [
        Path(settings.STORAGE_DIR) / "jobs" / job_id,
        Path(__file__).resolve().parent.parent.parent.parent / "storage" / "jobs" / job_id,
        Path.cwd() / "backend" / "storage" / "jobs" / job_id,
        Path.cwd() / "storage" / "jobs" / job_id,
    ]
    for p in candidates:
        if p.exists() and p.is_dir():
            return p
    return None


def _mark_job_trashed_on_disk(job_id: str, is_trashed: bool) -> None:
    """Write or delete trashed marker on disk across any found locations in sub-millisecond time."""
    candidates = [
        Path(settings.STORAGE_DIR) / "jobs" / job_id,
        Path(__file__).resolve().parent.parent.parent.parent / "storage" / "jobs" / job_id,
        Path.cwd() / "backend" / "storage" / "jobs" / job_id,
        Path.cwd() / "storage" / "jobs" / job_id,
    ]
    now_str = datetime.now(timezone.utc).isoformat()
    seen = set()
    for jdir in candidates:
        try:
            resolved = str(jdir.resolve())
        except Exception:
            resolved = str(jdir)
        if resolved in seen:
            continue
        seen.add(resolved)

        if jdir.exists() and jdir.is_dir():
            marker = jdir / "trashed.txt"
            if is_trashed:
                try:
                    marker.write_text(now_str, encoding="utf-8")
                except Exception:
                    pass
            else:
                try:
                    if marker.exists():
                        marker.unlink(missing_ok=True)
                except Exception:
                    pass


def _robust_remove_job_dir(job_id: str) -> None:
    """Robustly delete job directory on Windows avoiding lock or permission errors."""
    import os
    import stat

    candidates = [
        Path(settings.STORAGE_DIR) / "jobs" / job_id,
        Path(__file__).resolve().parent.parent.parent.parent / "storage" / "jobs" / job_id,
        Path.cwd() / "backend" / "storage" / "jobs" / job_id,
        Path.cwd() / "storage" / "jobs" / job_id,
    ]
    seen = set()
    for jdir in candidates:
        try:
            resolved = str(jdir.resolve())
        except Exception:
            resolved = str(jdir)
        if resolved in seen:
            continue
        seen.add(resolved)

        if jdir.exists() and jdir.is_dir():
            def on_rm_error(func, path, exc_info):
                try:
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                except Exception:
                    pass

            try:
                shutil.rmtree(jdir, onerror=on_rm_error)
            except Exception as e:
                logger.warning("shutil.rmtree failed on %s: %s", str(jdir), str(e))

            if jdir.exists():
                try:
                    for item in jdir.iterdir():
                        try:
                            if item.is_file():
                                os.chmod(str(item), stat.S_IWRITE)
                                item.unlink(missing_ok=True)
                            elif item.is_dir():
                                shutil.rmtree(item, ignore_errors=True)
                        except Exception:
                            pass
                    (jdir / "deleted_permanently.txt").write_text("deleted", encoding="utf-8")
                except Exception:
                    pass


@router.get(
    "/jobs/history",
    summary="Get user job processing history",
    description="Retrieve past processing jobs and downloads for the authenticated seller.",
)
async def get_job_history(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    trash: bool = Query(default=False, description="Filter to trashed batches if True"),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve paginated processing history for current user."""
    db = get_db()
    user_id = str(current_user["_id"])
    active_query = {"user_id": user_id, "is_trashed": {"$ne": True}}
    trash_query = {"user_id": user_id, "is_trashed": True}
    query = trash_query if trash else active_query

    items = []
    total = 0
    active_count = 0
    trash_count = 0

    if db is not None:
        try:
            import asyncio
            active_count_task = db.processing_jobs.count_documents(active_query)
            trash_count_task = db.processing_jobs.count_documents(trash_query)
            skip = (page - 1) * size
            cursor = db.processing_jobs.find(
                query,
                projection={
                    "_id": 1,
                    "job_id": 1,
                    "status": 1,
                    "created_at": 1,
                    "total_files": 1,
                    "total_labels_generated": 1,
                    "courier_breakdown": 1,
                    "main_skus": 1,
                    "downloads": 1,
                    "google_drive": 1,
                    "has_ambiguity": 1,
                    "formatted_filename": 1,
                    "marketplace": 1,
                    "is_trashed": 1,
                    "trashed_at": 1,
                },
            ).sort("created_at", -1).skip(skip).limit(size)

            active_count, trash_count = await asyncio.gather(active_count_task, trash_count_task)
            total = trash_count if trash else active_count

            async for doc in cursor:
                c_at = doc.get("created_at")
                if isinstance(c_at, datetime):
                    c_at_str = c_at.isoformat()
                elif c_at:
                    c_at_str = str(c_at)
                else:
                    c_at_str = datetime.now(timezone.utc).isoformat()

                items.append({
                    "id": str(doc["_id"]),
                    "job_id": doc.get("job_id"),
                    "status": doc.get("status", "completed"),
                    "created_at": c_at_str,
                    "total_files": doc.get("total_files", 0),
                    "total_labels_generated": doc.get("total_labels_generated", 0),
                    "courier_breakdown": doc.get("courier_breakdown", []),
                    "main_skus": doc.get("main_skus", []),
                    "downloads": doc.get("downloads", {}),
                    "google_drive": doc.get("google_drive", {}),
                    "has_ambiguity": doc.get("has_ambiguity", False),
                    "formatted_filename": doc.get("formatted_filename"),
                    "marketplace": doc.get("marketplace", "Meesho"),
                    "is_trashed": doc.get("is_trashed", False),
                    "trashed_at": doc.get("trashed_at"),
                })
        except Exception as e_db:
            logger.warning("Database query in get_job_history failed: %s", str(e_db))

    # Fast Local Server Disk Fallback: If 0 items returned from DB, scan local storage/jobs
    if active_count == 0 and trash_count == 0:
        storage_jobs_dir = _find_storage_jobs_dir()
        if storage_jobs_dir and storage_jobs_dir.exists():
            disk_active_items = []
            disk_trash_items = []
            for jdir in sorted(storage_jobs_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if jdir.is_dir() and (jdir / "processing_report.json").exists() and not (jdir / "deleted_permanently.txt").exists():
                    try:
                        rep = json.loads((jdir / "processing_report.json").read_text(encoding="utf-8"))
                        fn_file = jdir / "formatted_name.txt"
                        f_name = fn_file.read_text(encoding="utf-8").strip() if fn_file.exists() else rep.get("formatted_filename")
                        jid = jdir.name
                        c_at = rep.get("created_at") or datetime.fromtimestamp(jdir.stat().st_mtime, timezone.utc).isoformat()
                        is_trashed = (jdir / "trashed.txt").exists() or rep.get("is_trashed") is True
                        trashed_at = (jdir / "trashed.txt").read_text(encoding="utf-8").strip() if (jdir / "trashed.txt").exists() else rep.get("trashed_at")

                        entry = {
                            "id": jid,
                            "job_id": jid,
                            "status": rep.get("status", "completed"),
                            "created_at": c_at,
                            "total_files": rep.get("total_files", 1),
                            "total_labels_generated": rep.get("total_labels_generated", 0),
                            "courier_breakdown": rep.get("courier_breakdown", []),
                            "main_skus": rep.get("main_skus", []),
                            "downloads": rep.get("downloads", {
                                "thermal_pdf": f"{settings.API_V1_PREFIX}/labels/jobs/{jid}/download/pdf",
                                "picklist_csv": f"{settings.API_V1_PREFIX}/labels/jobs/{jid}/download/picklist",
                                "report_json": f"{settings.API_V1_PREFIX}/labels/jobs/{jid}/download/report",
                            }),
                            "google_drive": {},
                            "has_ambiguity": rep.get("has_ambiguity", False),
                            "formatted_filename": f_name,
                            "marketplace": rep.get("marketplace", "Meesho"),
                            "is_trashed": is_trashed,
                            "trashed_at": trashed_at,
                        }
                        if is_trashed:
                            disk_trash_items.append(entry)
                        else:
                            disk_active_items.append(entry)
                    except Exception:
                        pass
            active_count = len(disk_active_items)
            trash_count = len(disk_trash_items)
            selected_items = disk_trash_items if trash else disk_active_items
            skip = (page - 1) * size
            return {
                "items": selected_items[skip : skip + size],
                "total": len(selected_items),
                "page": page,
                "size": size,
                "active_count": active_count,
                "trash_count": trash_count,
            }

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "active_count": active_count,
        "trash_count": trash_count,
    }


@router.post(
    "/jobs/claim-history",
    summary="Claim guest processing jobs to authenticated user",
    description="Associates guest/unauthenticated jobs with the current user account, adds labels to Master Sheet, and saves SKUs.",
)
async def claim_history(
    payload: ClaimHistoryRequest,
    current_user: dict = Depends(get_current_user),
):
    """Claim previous unauthenticated jobs processed as guest and attach to user account."""
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable.",
        )

    user_id = str(current_user["_id"])
    claimed_count = 0
    from app.services.master_sheet.service import master_sheet_service

    for raw_id in payload.job_ids:
        job_id = str(raw_id).strip()
        if not re.match(r"^[a-zA-Z0-9_\-]+$", job_id):
            continue

        job_dir = _find_job_dir(job_id) or (Path(settings.STORAGE_DIR) / "jobs" / job_id)
        now_utc = datetime.now(timezone.utc)

        if job_dir.exists() and (job_dir / "deleted_permanently.txt").exists():
            continue

        # 1. Check if job already exists in db.processing_jobs
        existing_job = await db.processing_jobs.find_one({"job_id": job_id})
        candidate_labels = []
        formatted_name = None
        clean_mp = "Meesho"

        if existing_job:
            # If already assigned to this user, skip heavy reprocessing immediately
            if existing_job.get("user_id") == user_id:
                claimed_count += 1
                continue
            else:
                # Otherwise claim it for this user
                await db.processing_jobs.update_one(
                    {"_id": existing_job["_id"]},
                    {"$set": {"user_id": user_id, "updated_at": now_utc}}
                )
                claimed_count += 1
            formatted_name = existing_job.get("formatted_filename")
            clean_mp = existing_job.get("marketplace", "Meesho")
        elif job_dir.exists() and (job_dir / "processing_report.json").exists():
            # Job exists on disk from guest session, insert into MongoDB
            try:
                report_data = json.loads((job_dir / "processing_report.json").read_text(encoding="utf-8"))
            except Exception:
                report_data = {}

            if (job_dir / "formatted_name.txt").exists():
                try:
                    formatted_name = (job_dir / "formatted_name.txt").read_text(encoding="utf-8").strip()
                except Exception:
                    formatted_name = None

            if not formatted_name:
                formatted_name = report_data.get("formatted_filename") or f"meesho_batch_{job_id[:8]}.pdf"

            clean_mp = report_data.get("marketplace") or "Meesho"
            is_item_trashed = (job_dir / "trashed.txt").exists() or report_data.get("is_trashed") is True
            trashed_at = (job_dir / "trashed.txt").read_text(encoding="utf-8").strip() if (job_dir / "trashed.txt").exists() else report_data.get("trashed_at")

            try:
                await db.processing_jobs.insert_one({
                    "job_id": job_id,
                    "user_id": user_id,
                    "marketplace": clean_mp,
                    "formatted_filename": formatted_name,
                    "status": report_data.get("status", "completed"),
                    "created_at": report_data.get("created_at") or now_utc,
                    "total_files": report_data.get("total_files", 1),
                    "total_labels_generated": report_data.get("total_labels_generated", 0),
                    "total_invoices_removed": report_data.get("total_invoices_removed", 0),
                    "courier_breakdown": report_data.get("courier_breakdown", []),
                    "main_skus": report_data.get("main_skus", []),
                    "downloads": report_data.get("downloads", {
                        "thermal_pdf": f"{settings.API_V1_PREFIX}/labels/jobs/{job_id}/download/pdf",
                        "picklist_csv": f"{settings.API_V1_PREFIX}/labels/jobs/{job_id}/download/picklist",
                        "report_json": f"{settings.API_V1_PREFIX}/labels/jobs/{job_id}/download/report",
                    }),
                    "has_ambiguity": report_data.get("has_ambiguity", False),
                    "is_trashed": is_item_trashed,
                    "trashed_at": trashed_at,
                })
                claimed_count += 1
            except Exception as e_ins:
                logger.warning("Failed to insert claimed job %s: %s", job_id, str(e_ins))

        # 2. Add labels to Master Sheet if candidate_labels.json is available
        if (job_dir / "candidate_labels.json").exists():
            try:
                candidate_labels = json.loads((job_dir / "candidate_labels.json").read_text(encoding="utf-8"))
                if candidate_labels and not is_item_trashed:
                    await master_sheet_service.record_batch_labels(
                        user_id=user_id,
                        job_id=job_id,
                        labels=candidate_labels,
                        marketplace=clean_mp,
                        custom_pdf_name=formatted_name,
                    )
            except Exception as e_ms:
                logger.warning("Failed to record batch labels to Master Sheet during claim for job %s: %s", job_id, str(e_ms))

    logger.info("User %s successfully claimed %d/%d jobs", user_id, claimed_count, len(payload.job_ids))
    return {"claimed": claimed_count, "total": len(payload.job_ids)}



@router.post(
    "/labels/jobs/{job_id}/resolve-ambiguity",
    response_model=ProcessingJobResponse,
    summary="Resolve ambiguous labels in a job",
    description="Applies user-selected SKU confirmations, persists rules, and re-compiles 4x6 PDF & picklist.",
)
async def resolve_job_ambiguity(
    job_id: str,
    payload: ResolveAmbiguityRequest,
    current_user: Optional[dict] = Depends(get_optional_current_user),
) -> ProcessingJobResponse:
    """Resolve ambiguous SKUs for a processing job and re-render artifacts."""
    job_dir = _find_job_dir(job_id) or (Path(settings.STORAGE_DIR) / "jobs" / job_id)
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
    user_id = str(current_user["_id"]) if current_user else None
    now = datetime.now(timezone.utc)

    for res in payload.resolutions:
        clean_chosen = res.chosen_sku.strip()
        keyword_val = (res.matching_keyword or res.chosen_sku or res.raw_product_text).strip()
        # Support multiple comma/semicolon/newline-separated keywords per SKU
        individual_kws = [k.strip() for k in re.split(r"[,;\n\r]+", keyword_val) if k.strip()]
        if not individual_kws:
            individual_kws = [clean_chosen]

        norm_raw = normalize_text(res.raw_product_text)

        if db is not None and user_id:
            # 1. Save or update decision rules for each keyword
            for single_kw in individual_kws:
                norm_kw = normalize_text(single_kw)
                if norm_kw:
                    await db.sku_decisions.update_one(
                        {"user_id": user_id, "normalized_product_text": norm_kw},
                        {
                            "$set": {
                                "user_id": user_id,
                                "raw_product_text": single_kw,
                                "normalized_product_text": norm_kw,
                                "chosen_sku": clean_chosen,
                                "created_at": now,
                                "job_id": job_id,
                            }
                        },
                        upsert=True,
                    )
            if norm_raw:
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

            # Keep user_skus synchronized: add newly mapped keywords to existing SKU or create if remember_rule
            from app.api.v1.endpoints.skus import _get_user_clauses
            user_email = current_user.get("email") if current_user else None
            user_clauses = _get_user_clauses(user_id, user_email)
            existing_user_sku = await db.user_skus.find_one({
                "$or": user_clauses,
                "sku_code": {"$regex": f"^{re.escape(clean_chosen)}$", "$options": "i"},
            })
            if existing_user_sku:
                current_kws = existing_user_sku.get("keywords", [])
                new_kws = [k for k in individual_kws if k not in current_kws]
                if new_kws:
                    await db.user_skus.update_one(
                        {"_id": existing_user_sku["_id"]},
                        {"$addToSet": {"keywords": {"$each": new_kws}}},
                    )
            elif res.remember_rule:
                await db.user_skus.insert_one({
                    "user_id": user_id,
                    "sku_code": clean_chosen.upper(),
                    "product_name": clean_chosen.upper(),
                    "keywords": list(set([clean_chosen.upper()] + individual_kws)),
                    "aliases": [],
                    "priority": 0,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                })

    # Load active user SKUs early so they are available for both filtering and groupings
    user_skus_list: List[Dict[str, Any]] = []
    if user_id:
        try:
            from app.api.v1.endpoints.skus import _get_user_clauses
            user_email = current_user.get("email") if current_user else None
            user_clauses = _get_user_clauses(user_id, user_email)
            async for u_doc in db.user_skus.find({
                "$or": user_clauses,
                "is_active": {"$ne": False},
            }):
                user_skus_list.append(u_doc)
        except Exception as u_err:
            logger.warning("Could not pre-load user_skus for job %s: %s", job_id, str(u_err))

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
            # When splitting or resolving a specific variant, match against that specific keyword
            if norm_kw and norm_kw != norm_raw_prod:
                if norm_kw in norm_c_sku or norm_kw in norm_c_text or norm_kw in existing_assigned:
                    is_match = True
                elif keyword_val.upper() in raw_sku_text.upper() or keyword_val.upper() in raw_page_text.upper():
                    is_match = True
            else:
                # Direct match against candidate SKU or previously assigned item
                if norm_raw_prod and (norm_raw_prod == norm_c_sku or norm_raw_prod in existing_assigned):
                    is_match = True
                elif norm_kw and (norm_kw == norm_c_sku or norm_kw in existing_assigned):
                    is_match = True
                elif norm_kw and (norm_kw in norm_c_sku or norm_kw in norm_c_text):
                    is_match = True
                elif norm_raw_prod and (norm_raw_prod in norm_c_sku or norm_raw_prod in norm_c_text):
                    is_match = True
                elif keyword_val.upper() in raw_sku_text.upper() or keyword_val.upper() in raw_page_text.upper():
                    is_match = True

            # Infallible sub-token / compact string matching
            if not is_match and (norm_kw or norm_raw_prod):
                target_p = norm_kw or norm_raw_prod
                compact_p = target_p.replace(" ", "")
                compact_c = norm_c_sku.replace(" ", "")
                if compact_p and (compact_p == compact_c or (len(compact_p) >= 4 and compact_p in compact_c)):
                    is_match = True
                elif any(target_p == normalize_text(getattr(s, "sku", str(s))) for s in c.get("sku_items", [])):
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
            variant_name = c.get("raw_sku") or (sku_items[0].sku if sku_items else matched_resolution_sku)
            resolved_sku = ExtractedSKU(
                sku=variant_name,
                quantity=sku_items[0].quantity if sku_items else 1,
                description=matched_resolution_sku,
                order_id=c.get("order_id"),
                match_type="user_confirmed",
                confidence=1.0,
            )
            sku_items = [resolved_sku]

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
                "marketplace": c_lbl.get("marketplace", "Meesho"),
            })
        with open(labels_file, "w", encoding="utf-8") as f:
            json.dump(candidate_labels_serializable, f, indent=2)
    except Exception as save_err:
        logger.warning("Could not persist updated candidate labels for job %s: %s", job_id, str(save_err))

    # 4. Filter candidate labels based on user exclusions before sorting
    excluded_main_set = {s.strip().upper() for s in (config.excluded_main_skus or []) if s.strip()}
    excluded_sku_set = {s.strip().upper() for s in (config.excluded_skus or []) if s.strip()}
    excluded_courier_set = {s.strip().upper() for s in (config.excluded_couriers or []) if s.strip()}
    excluded_order_set = {str(s).strip().upper() for s in (config.excluded_order_ids or []) if str(s).strip()}
    excluded_mp_set = {s.strip().upper() for s in (config.excluded_marketplaces or []) if s.strip()}

    filtered_labels: List[Dict] = []
    for lbl in active_labels:
        # Check Marketplace exclusion
        lbl_mp = (lbl.get("marketplace") or "Meesho").strip().upper()
        if lbl_mp in excluded_mp_set:
            continue

        lbl_ord = (lbl.get("order_id") or "").strip().upper()
        lbl_wbl = (lbl.get("wbl_id") or "").strip().upper()
        if (lbl_ord and lbl_ord in excluded_order_set) or (lbl_wbl and lbl_wbl in excluded_order_set):
            continue

        courier_name = (lbl.get("courier_partner") or "Unassigned").strip().upper()
        if courier_name in excluded_courier_set:
            continue

        s_items = lbl.get("sku_items") or []
        if s_items:
            primary_sku = getattr(s_items[0], "sku", str(s_items[0])).strip()
            parent_desc = getattr(s_items[0], "description", None)
            if parent_desc and str(parent_desc).strip() and str(parent_desc).strip().upper() not in ("UNMATCHED", "UNKNOWN", "UNKNOWN SKUS", "OTHER"):
                main_sku = str(parent_desc).strip().upper()
            else:
                main_sku = get_main_sku_group(
                    primary_sku,
                    user_skus=user_skus_list,
                    smart_sku_detection=getattr(config, "smart_sku_detection", False),
                ).strip().upper()
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
    elif config.sort_by == SortCriterion.MARKETPLACE:
        sorted_labels = courier_sorter_service.sort_by_marketplace(filtered_labels)
    elif config.sort_by == SortCriterion.MARKETPLACE_SKU_COURIER:
        sorted_labels = courier_sorter_service.sort_by_marketplace_sku_courier(filtered_labels)
    elif config.sort_by == SortCriterion.MARKETPLACE_COURIER:
        sorted_labels = courier_sorter_service.sort_by_marketplace_courier(filtered_labels)
    elif config.sort_by == SortCriterion.SKU_MARKETPLACE_COURIER:
        sorted_labels = courier_sorter_service.sort_by_sku_marketplace_courier(filtered_labels)
    elif config.sort_by == SortCriterion.COURIER_SKU_MARKETPLACE:
        sorted_labels = courier_sorter_service.sort_by_courier_sku_marketplace(filtered_labels)
    elif config.sort_by == SortCriterion.COURIER_MARKETPLACE_SKU:
        sorted_labels = courier_sorter_service.sort_by_courier_marketplace_sku(filtered_labels)
    elif config.sort_by == SortCriterion.SKU_COURIER_MARKETPLACE:
        sorted_labels = courier_sorter_service.sort_by_sku_courier_marketplace(filtered_labels)
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
                # Search for buffered source file safely
                clean_target = Path(fname).name.lower()
                for f in job_dir.glob("src_*"):
                    f_name_lower = f.name.lower()
                    if f_name_lower.endswith(clean_target) or clean_target in f_name_lower:
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
    user_skus_list = []
    if user_id:
        try:
            from app.api.v1.endpoints.skus import _get_user_clauses
            user_email = current_user.get("email") if current_user else None
            user_clauses = _get_user_clauses(user_id, user_email)
            async for u_doc in db.user_skus.find({
                "$or": user_clauses,
                "is_active": {"$ne": False},
            }):
                user_skus_list.append(u_doc)
        except Exception:
            pass

    raw_label_summary_items = [
        {
            "courier": lbl.get("courier_partner") or "Unassigned",
            "order_id": lbl.get("order_id"),
            "sku_items": lbl.get("sku_items") or [],
            "raw_text": lbl.get("raw_text", ""),
        }
        for lbl in active_labels
    ]
    main_skus, all_skus = picklist_generator_service.group_skus_for_inspection(
        raw_label_summary_items,
        user_skus=user_skus_list,
        smart_sku_detection=getattr(config, "smart_sku_detection", False),
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

    mp_counts: Dict[str, int] = {}
    for label in sorted_labels:
        m_name = (label.get("marketplace") or "Meesho").capitalize()
        mp_counts[m_name] = mp_counts.get(m_name, 0) + 1

    marketplace_breakdown: List[MarketplaceSummary] = []
    for m_name, count in sorted(mp_counts.items(), key=lambda x: -x[1]):
        pct = round((count / total_labels * 100), 1) if total_labels > 0 else 0.0
        marketplace_breakdown.append(
            MarketplaceSummary(marketplace=m_name, label_count=count, percentage=pct)
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
        marketplace_breakdown=marketplace_breakdown,
        main_skus=main_skus,
        all_skus=all_skus,
        picklist_items=picklist_items,
        pages=[],
        warnings=["Ambiguity resolved with user confirmations."],
        has_ambiguity=False,
        ambiguous_labels=[],
        has_duplicates=previous_report_data.get("has_duplicates", False),
        all_labels_duplicate=previous_report_data.get("all_labels_duplicate", False),
        duplicate_labels=previous_report_data.get("duplicate_labels", []),
        excluded_duplicates_count=previous_report_data.get("excluded_duplicates_count", 0),
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
        if user_id:
            import asyncio
            asyncio.create_task(
                master_sheet_service.record_batch_labels(
                    user_id=user_id,
                    job_id=job_id,
                    labels=sorted_labels,
                    marketplace=marketplace,
                    custom_pdf_name=custom_pdf_name,
                )
            )
    except Exception as m_err:
        logger.warning("Failed to update Master Sheet after ambiguity resolution: %s", str(m_err))

    return updated_response


@router.post(
    "/jobs/clear-all",
    summary="Move all active jobs to trash",
    description="Soft-deletes all active processing jobs for the current seller.",
)
async def clear_all_jobs(
    current_user: dict = Depends(get_current_user),
):
    """Move all active jobs of the seller to trash."""
    db = get_db()
    user_id = str(current_user["_id"])
    now_str = datetime.now(timezone.utc).isoformat()
    cleared_count = 0

    if db is not None:
        try:
            res = await db.processing_jobs.update_many(
                {"user_id": user_id, "is_trashed": {"$ne": True}},
                {"$set": {"is_trashed": True, "trashed_at": now_str}}
            )
            cleared_count = res.modified_count
        except Exception as e:
            logger.warning("Failed to clear all jobs in db: %s", str(e))

    # Also mark all jobs on disk as trashed if user has disk jobs
    storage_jobs_dir = _find_storage_jobs_dir()
    if storage_jobs_dir and storage_jobs_dir.exists():
        for jdir in storage_jobs_dir.iterdir():
            if jdir.is_dir() and (jdir / "processing_report.json").exists() and not (jdir / "deleted_permanently.txt").exists():
                _mark_job_trashed_on_disk(jdir.name, True)
                cleared_count += 1

    # Hide all master sheet labels
    try:
        from app.services.master_sheet.service import master_sheet_service
        await master_sheet_service.trash_all_user_labels(user_id=user_id)
    except Exception as e_ms:
        logger.warning("Failed to trash all master sheet labels for user %s: %s", user_id, str(e_ms))

    logger.info("User %s moved all active jobs to trash (count: %d)", user_id, cleared_count)
    return {"message": "All active batches moved to trash.", "cleared_count": cleared_count}


@router.delete(
    "/jobs/trash/empty",
    summary="Empty trash permanently",
    description="Permanently deletes all trashed jobs from database, Master Sheet, and disk.",
)
async def empty_trash(
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete all jobs currently in trash."""
    db = get_db()
    user_id = str(current_user["_id"])
    deleted_count = 0
    trashed_job_ids = []

    if db is not None:
        try:
            cursor = db.processing_jobs.find({"user_id": user_id, "is_trashed": True})
            async for doc in cursor:
                jid = doc.get("job_id")
                if jid:
                    trashed_job_ids.append(jid)
            res = await db.processing_jobs.delete_many({"user_id": user_id, "is_trashed": True})
            deleted_count = res.deleted_count
        except Exception as e:
            logger.warning("Failed to empty trash in db: %s", str(e))

    # Also check disk for any jobs with trashed.txt marker
    storage_jobs_dir = _find_storage_jobs_dir()
    if storage_jobs_dir and storage_jobs_dir.exists():
        for jdir in storage_jobs_dir.iterdir():
            if jdir.is_dir() and (jdir / "trashed.txt").exists():
                if jdir.name not in trashed_job_ids:
                    trashed_job_ids.append(jdir.name)

    # Clean up Master Sheet and Disk for each trashed job ID
    from app.services.master_sheet.service import master_sheet_service
    for jid in trashed_job_ids:
        try:
            await master_sheet_service.delete_job_labels(user_id=user_id, job_id=jid)
        except Exception:
            pass
        _robust_remove_job_dir(jid)

    try:
        await master_sheet_service.cleanup_orphaned_labels(user_id=user_id)
    except Exception:
        pass

    logger.info("User %s emptied trash (%d batches removed)", user_id, len(trashed_job_ids))
    return {"message": "Trash emptied successfully.", "deleted_count": len(trashed_job_ids) or deleted_count}


@router.post(
    "/jobs/{job_id}/trash",
    summary="Move processing job to trash",
    description="Soft-deletes a processing job by marking it as trashed.",
)
async def trash_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Soft delete a job by moving it to trash."""
    db = get_db()
    user_id = str(current_user["_id"])
    now_str = datetime.now(timezone.utc).isoformat()

    if db is not None:
        try:
            res = await db.processing_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"is_trashed": True, "trashed_at": now_str, "user_id": user_id}}
            )
            if res.matched_count == 0:
                # If job was on disk but not yet in db, insert it trashed
                jdir = _find_job_dir(job_id)
                if jdir and (jdir / "processing_report.json").exists():
                    try:
                        rep = json.loads((jdir / "processing_report.json").read_text(encoding="utf-8"))
                        fn_file = jdir / "formatted_name.txt"
                        f_name = fn_file.read_text(encoding="utf-8").strip() if fn_file.exists() else rep.get("formatted_filename")
                        await db.processing_jobs.insert_one({
                            "job_id": job_id,
                            "user_id": user_id,
                            "marketplace": rep.get("marketplace", "Meesho"),
                            "formatted_filename": f_name or f"meesho_{job_id}.pdf",
                            "status": rep.get("status", "completed"),
                            "created_at": rep.get("created_at") or now_str,
                            "total_files": rep.get("total_files", 1),
                            "total_labels_generated": rep.get("total_labels_generated", 0),
                            "total_invoices_removed": rep.get("total_invoices_removed", 0),
                            "courier_breakdown": rep.get("courier_breakdown", []),
                            "main_skus": rep.get("main_skus", []),
                            "downloads": rep.get("downloads", {}),
                            "has_ambiguity": rep.get("has_ambiguity", False),
                            "is_trashed": True,
                            "trashed_at": now_str,
                        })
                    except Exception as e_ins:
                        logger.warning("Could not insert trashed disk job into db: %s", str(e_ins))
        except Exception as e:
            logger.warning("Failed to update job %s to trashed in db: %s", job_id, str(e))

    # Mark on disk
    _mark_job_trashed_on_disk(job_id, True)

    # Hide labels from Master Sheet
    try:
        from app.services.master_sheet.service import master_sheet_service
        await master_sheet_service.trash_job_labels(user_id=user_id, job_id=job_id)
    except Exception as e_ms:
        logger.warning("Failed to trash master sheet labels for job %s: %s", job_id, str(e_ms))

    logger.info("User %s moved job %s to trash", user_id, job_id)
    return {"message": f"Batch {job_id} moved to trash successfully.", "job_id": job_id}


@router.post(
    "/jobs/{job_id}/restore",
    summary="Restore processing job from trash",
    description="Restores a previously trashed processing job back to active history.",
)
async def restore_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Restore a job from trash."""
    db = get_db()
    user_id = str(current_user["_id"])

    if db is not None:
        try:
            await db.processing_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"is_trashed": False}, "$unset": {"trashed_at": ""}}
            )
        except Exception as e:
            logger.warning("Failed to restore job %s in db: %s", job_id, str(e))

    # Unmark on disk
    _mark_job_trashed_on_disk(job_id, False)

    # Restore labels to Master Sheet
    try:
        from app.services.master_sheet.service import master_sheet_service
        await master_sheet_service.restore_job_labels(user_id=user_id, job_id=job_id)
    except Exception as e_ms:
        logger.warning("Failed to restore master sheet labels for job %s: %s", job_id, str(e_ms))

    logger.info("User %s restored job %s from trash", user_id, job_id)
    return {"message": f"Batch {job_id} restored successfully.", "job_id": job_id}


@router.delete(
    "/jobs/{job_id}",
    summary="Permanently delete processing job from history",
    description="Permanently deletes job record from database, Master Sheet, and local files.",
)
async def delete_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete a user processing job record."""
    db = get_db()
    user_id = str(current_user["_id"])

    if db is not None:
        try:
            # Delete from processing_jobs
            await db.processing_jobs.delete_many({"job_id": job_id})
        except Exception as e_db:
            logger.warning("Database delete failed in delete_job: %s", str(e_db))

    # Cascade delete associated labels from Master Sheet
    try:
        from app.services.master_sheet.service import master_sheet_service
        await master_sheet_service.delete_job_labels(user_id=user_id, job_id=job_id)
        await master_sheet_service.cleanup_orphaned_labels(user_id=user_id)
    except Exception as m_err:
        logger.warning("Failed to cascade delete Master Sheet labels for job %s: %s", job_id, str(m_err))

    # Clean up local storage directory completely
    _robust_remove_job_dir(job_id)

    logger.info("User %s permanently deleted job record %s", user_id, job_id)
    return {"message": f"Batch {job_id} deleted permanently.", "job_id": job_id}


@router.get(
    "/jobs/{job_id}/download",
    summary="Download thermal PDF for job (convenience alias)",
)
async def download_job_pdf_alias(job_id: str):
    """Direct alias to download the 4x6 thermal PDF for a job."""
    from fastapi.responses import FileResponse
    job_dir = _find_job_dir(job_id)
    if not job_dir or not job_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found or has expired.",
        )
    file_path = job_dir / "labels_thermal_4x6.pdf"
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thermal PDF was not generated or has expired for this job.",
        )
    fn_file = job_dir / "formatted_name.txt"
    pdf_name = fn_file.read_text(encoding="utf-8").strip() if fn_file.exists() else f"labels_{job_id}.pdf"
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=pdf_name,
    )

    return {"message": f"Batch {job_id} permanently deleted successfully."}
