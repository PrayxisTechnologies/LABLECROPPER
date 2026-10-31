"""Cloud Label Queue & Multi-Device Sync Endpoints.

Allows e-commerce sellers and warehouse teams to upload shipping labels
from multiple devices/browsers into a unified cloud queue, and print them
in 1-click from a designated thermal printing station.
Includes strict user-tenant isolation and 48-hour automated disk cleanup.
"""

import os
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db

router = APIRouter(prefix="/cloud-vault", tags=["Cloud Vault"])
settings = get_settings()

# Base storage directory for cloud vault PDFs
CLOUD_VAULT_DIR = Path(settings.STORAGE_DIR) / "cloud_vault"
CLOUD_VAULT_DIR.mkdir(parents=True, exist_ok=True)


class CloudQueueItemResponse(BaseModel):
    id: str
    file_id: str
    filename: str
    file_size: int
    platform: str
    status: str
    uploaded_at: datetime
    printed_at: Optional[datetime] = None
    source_browser: Optional[str] = None


class MarkPrintedRequest(BaseModel):
    file_ids: Optional[List[str]] = Field(default_factory=list)
    filenames: Optional[List[str]] = Field(default_factory=list)
    job_id: Optional[str] = None


def _get_user_id(current_user: Dict[str, Any]) -> str:
    """Extract string ID from authenticated user document."""
    raw_id = current_user.get("_id") or current_user.get("id")
    return str(raw_id)


def _detect_platform(filename: str) -> str:
    """Detect marketplace platform from filename."""
    lower = filename.lower()
    if "sub_order" in lower or "meesho" in lower:
        return "Meesho"
    if "invoice_labels" in lower or "flipkart" in lower or "ekart" in lower:
        return "Flipkart"
    if "amazon" in lower or "ats" in lower:
        return "Amazon"
    if "snapdeal" in lower:
        return "Snapdeal"
    if "myntra" in lower:
        return "Myntra"
    return "Shipping Label"


def cleanup_expired_cloud_files():
    """Deletes physical files on disk older than 48 hours."""
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=48)
        if not CLOUD_VAULT_DIR.exists():
            return

        for user_dir in CLOUD_VAULT_DIR.iterdir():
            if user_dir.is_dir():
                for f in user_dir.glob("*.pdf"):
                    try:
                        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
                        if mtime < cutoff:
                            f.unlink(missing_ok=True)
                            logger.info("Purged expired cloud vault PDF: %s", f.name)
                    except Exception:
                        pass
    except Exception as e:
        logger.warning("Error running cloud vault file cleanup: %s", str(e))


@router.post(
    "/upload",
    response_model=List[CloudQueueItemResponse],
    summary="Upload label PDFs to user cloud queue",
    description="Uploads one or more shipping label PDFs to the user cloud queue for multi-device cross-browser access.",
)
async def upload_cloud_labels(
    files: List[UploadFile] = File(...),
    source_browser: Optional[str] = Form(default="Chrome"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Stores PDFs on server disk and records metadata in MongoDB under user_id."""
    user_id = _get_user_id(current_user)
    user_vault_dir = CLOUD_VAULT_DIR / user_id
    user_vault_dir.mkdir(parents=True, exist_ok=True)

    db = get_db()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=48)

    created_items: List[CloudQueueItemResponse] = []

    for upload_file in files:
        raw_name = upload_file.filename or "shipping_label.pdf"
        # Sanitize filename
        clean_filename = Path(raw_name).name
        file_id = f"cv_{uuid.uuid4().hex[:12]}"
        disk_filename = f"{file_id}_{clean_filename}"
        disk_path = user_vault_dir / disk_filename

        # Write to disk
        try:
            content = await upload_file.read()
            file_size = len(content)
            with open(disk_path, "wb") as f:
                f.write(content)
        except Exception as e:
            logger.error("Failed to write cloud vault file: %s", str(e))
            continue

        platform = _detect_platform(clean_filename)

        doc = {
            "user_id": user_id,
            "file_id": file_id,
            "filename": clean_filename,
            "file_size": file_size,
            "platform": platform,
            "status": "pending",
            "source_browser": source_browser,
            "storage_path": str(disk_path),
            "uploaded_at": now,
            "printed_at": None,
            "expires_at": expires_at,
        }

        if db is not None:
            try:
                res = await db.cloud_label_queue.insert_one(doc)
                doc["_id"] = res.inserted_id
            except Exception as e:
                logger.warning("MongoDB insert failed for cloud vault item: %s", str(e))

        created_items.append(
            CloudQueueItemResponse(
                id=str(doc.get("_id", file_id)),
                file_id=file_id,
                filename=clean_filename,
                file_size=file_size,
                platform=platform,
                status="pending",
                uploaded_at=now,
                printed_at=None,
                source_browser=source_browser,
            )
        )

    return created_items


@router.get(
    "/queue",
    response_model=List[CloudQueueItemResponse],
    summary="Get user's pending cloud label queue",
    description="Returns all unprinted shipping labels uploaded under this user account from any browser/device.",
)
async def get_cloud_queue(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieves all pending queue items for the authenticated user."""
    user_id = _get_user_id(current_user)
    db = get_db()
    if db is None:
        return []

    try:
        cursor = db.cloud_label_queue.find(
            {"user_id": user_id, "status": "pending"}
        ).sort("uploaded_at", -1)

        docs = await cursor.to_list(length=100)
        items: List[CloudQueueItemResponse] = []
        for d in docs:
            items.append(
                CloudQueueItemResponse(
                    id=str(d["_id"]),
                    file_id=d["file_id"],
                    filename=d["filename"],
                    file_size=d.get("file_size", 0),
                    platform=d.get("platform", "Meesho"),
                    status=d["status"],
                    uploaded_at=d.get("uploaded_at", datetime.now(timezone.utc)),
                    printed_at=d.get("printed_at"),
                    source_browser=d.get("source_browser"),
                )
            )
        return items
    except Exception as e:
        logger.error("Error retrieving cloud queue: %s", str(e))
        return []


@router.get(
    "/download/{file_id}",
    summary="Download binary PDF for printing",
    description="Streams the actual binary PDF for cropping and printing at the thermal station.",
)
async def download_cloud_label(
    file_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Streams the requested PDF file ensuring user-tenant ownership."""
    user_id = _get_user_id(current_user)
    db = get_db()

    target_path = None
    filename = "shipping_label.pdf"

    if db is not None:
        try:
            doc = await db.cloud_label_queue.find_one({"file_id": file_id, "user_id": user_id})
            if doc:
                filename = doc.get("filename", filename)
                storage_path = doc.get("storage_path")
                if storage_path and Path(storage_path).exists():
                    target_path = Path(storage_path)
        except Exception as e:
            logger.warning("Error querying cloud vault item: %s", str(e))

    # Fallback disk check
    if not target_path:
        user_vault_dir = CLOUD_VAULT_DIR / user_id
        if user_vault_dir.exists():
            for p in user_vault_dir.glob(f"{file_id}_*.pdf"):
                target_path = p
                filename = p.name.split("_", 1)[1] if "_" in p.name else p.name
                break

    if not target_path or not target_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Label PDF not found or has expired.",
        )

    return FileResponse(
        path=str(target_path),
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/sync",
    summary="Get multi-device cloud vault sync state",
    description="Returns pending queue items, list of all printed filenames, and recent processing history for this user account.",
)
async def sync_cloud_vault(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Provides unified cross-browser sync for pending labels, printed acknowledgments, and history batches."""
    user_id = _get_user_id(current_user)
    db = get_db()
    if db is None:
        return {"pending": [], "printed_filenames": [], "history": []}

    try:
        now_utc = datetime.now(timezone.utc)

        # 1. Fetch all printed records from cloud_label_queue for this user
        printed_cursor = db.cloud_label_queue.find(
            {"user_id": user_id, "status": "printed"}
        ).sort("printed_at", -1)
        printed_docs = await printed_cursor.to_list(length=200)

        printed_filenames_set = set()
        for d in printed_docs:
            if d.get("filename"):
                printed_filenames_set.add(d["filename"].strip())

        # 2. Fetch recent completed processing jobs (up to 30) from db.processing_jobs
        jobs_cursor = db.processing_jobs.find(
            {
                "user_id": user_id,
                "is_trashed": {"$ne": True},
            }
        ).sort("created_at", -1)
        job_docs = await jobs_cursor.to_list(length=30)

        history_items = []
        for j in job_docs:
            jid = j.get("job_id")
            c_at = j.get("created_at")
            if isinstance(c_at, datetime):
                c_at_ms = int(c_at.timestamp() * 1000)
            else:
                c_at_ms = int(now_utc.timestamp() * 1000)

            orig_files = j.get("original_filenames") or []
            for orig in orig_files:
                if orig:
                    printed_filenames_set.add(orig.strip())

            formatted_name = j.get("formatted_filename") or f"labels_{jid}.pdf"
            history_items.append({
                "id": jid,
                "job_id": jid,
                "name": formatted_name,
                "filename": formatted_name,
                "original_files": orig_files,
                "total_labels": j.get("total_labels_generated", 1),
                "total_files": j.get("total_files", 1),
                "formatted_size": "Thermal 4×6",
                "marketplace": j.get("marketplace", "Meesho"),
                "type_badge": "Label Only",
                "download_url": f"{settings.API_V1_PREFIX}/labels/jobs/{jid}/download/pdf",
                "view_url": f"{settings.API_V1_PREFIX}/labels/jobs/{jid}/view/pdf",
                "status": "printed",
                "selected": False,
                "created_at": c_at_ms,
                "printedAt": c_at_ms,
                "dateAdded": c_at_ms,
            })

        # 3. Return pending cloud queue items
        pending_cursor = db.cloud_label_queue.find(
            {"user_id": user_id, "status": "pending"}
        ).sort("uploaded_at", -1)
        pending_docs = await pending_cursor.to_list(length=100)

        active_pending_items: List[CloudQueueItemResponse] = []
        for d in pending_docs:
            active_pending_items.append(
                CloudQueueItemResponse(
                    id=str(d["_id"]),
                    file_id=d["file_id"],
                    filename=(d.get("filename") or "").strip(),
                    file_size=d.get("file_size", 0),
                    platform=d.get("platform", "Meesho"),
                    status="pending",
                    uploaded_at=d.get("uploaded_at", now_utc),
                    printed_at=None,
                    source_browser=d.get("source_browser"),
                )
            )

        return {
            "pending": active_pending_items,
            "printed_filenames": list(printed_filenames_set),
            "history": history_items,
        }
    except Exception as e:
        logger.error("Error in sync_cloud_vault: %s", str(e), exc_info=True)
        return {"pending": [], "printed_filenames": [], "history": []}


@router.post(
    "/mark-printed",
    summary="Acknowledge printing and move to printed history",
    description="Updates status of specified labels to 'printed' so all devices reflect the acknowledgment.",
)
async def mark_cloud_labels_printed(
    payload: MarkPrintedRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Marks queue items as printed across all user devices."""
    user_id = _get_user_id(current_user)
    db = get_db()
    now = datetime.now(timezone.utc)

    file_ids = payload.file_ids or []
    filenames = payload.filenames or []

    if not file_ids and not filenames:
        return {"success": True, "updated": 0}

    query: Dict[str, Any] = {"user_id": user_id}
    conditions = []
    if file_ids:
        conditions.append({"file_id": {"$in": file_ids}})
    if filenames:
        conditions.append({"filename": {"$in": filenames}})
        for fn in filenames:
            clean = fn.strip()
            if clean:
                conditions.append({"filename": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}})

    if len(conditions) == 1:
        query.update(conditions[0])
    else:
        query["$or"] = conditions

    updated_count = 0
    if db is not None:
        try:
            res = await db.cloud_label_queue.update_many(
                query,
                {"$set": {"status": "printed", "printed_at": now, "job_id": payload.job_id}},
            )
            updated_count = res.modified_count
        except Exception as e:
            logger.error("Failed to mark cloud labels printed: %s", str(e))

    return {"success": True, "updated": updated_count}


@router.delete(
    "/{file_id}",
    summary="Delete label PDF from cloud queue",
    description="Deletes a label PDF from the user's queue and purges it from disk.",
)
async def delete_cloud_label(
    file_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Deletes queue item and removes underlying PDF file."""
    user_id = _get_user_id(current_user)
    db = get_db()

    if db is not None:
        try:
            doc = await db.cloud_label_queue.find_one({"file_id": file_id, "user_id": user_id})
            if doc:
                storage_path = doc.get("storage_path")
                if storage_path and Path(storage_path).exists():
                    Path(storage_path).unlink(missing_ok=True)
                await db.cloud_label_queue.delete_one({"_id": doc["_id"]})
                return {"success": True, "deleted": file_id}
        except Exception as e:
            logger.error("Error deleting cloud vault item: %s", str(e))

    return {"success": False, "error": "Item not found"}
