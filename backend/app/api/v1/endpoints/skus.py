"""Endpoints for personal SKU database management with tenant isolation."""

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.logging import logger
from app.db.mongodb import ObjectId, get_db
from app.schemas.sku import (
    SKUConflictCheckRequest,
    SKUConflictCheckResponse,
    SKUImportResult,
    SKUListResponse,
    UserSKUCreate,
    UserSKUResponse,
    UserSKUUpdate,
)

router = APIRouter()


def _doc_to_sku_response(doc: dict) -> UserSKUResponse:
    """Format MongoDB document into UserSKUResponse schema."""
    return UserSKUResponse(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        sku_code=doc["sku_code"],
        product_name=doc["product_name"],
        keywords=doc.get("keywords", []),
        aliases=doc.get("aliases", []),
        priority=doc.get("priority", 0),
        is_active=doc.get("is_active", True),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
    )


async def sync_user_skus_from_history(db: Any, user_id: str) -> int:
    """Scan user's processed batch history and master sheet to populate Personal SKU Database."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    synced_skus: Dict[str, List[str]] = {}  # sku_code -> list of keywords

    # 1. Scan db.processing_jobs
    try:
        user_filter = [{"user_id": user_id}]
        try:
            user_filter.append({"user_id": ObjectId(user_id)})
        except Exception:
            pass

        cursor = db.processing_jobs.find({"$or": user_filter})
        async for doc in cursor:
            main_skus = doc.get("main_skus", [])
            job_id = doc.get("job_id")
            if not main_skus and job_id:
                disk_report = Path(settings.STORAGE_DIR) / "jobs" / job_id / "processing_report.json"
                if disk_report.exists():
                    try:
                        with open(disk_report, "r", encoding="utf-8") as rf:
                            rep = json.load(rf)
                            main_skus = rep.get("main_skus", [])
                    except Exception:
                        pass

            for m in main_skus:
                code = (m.get("main_sku") or "").strip()
                if code and code.upper() != "UNMATCHED":
                    if code not in synced_skus:
                        synced_skus[code] = [code]
                    for s in m.get("sub_skus", []):
                        sub_code = (s.get("sku") or "").strip()
                        if sub_code and sub_code.upper() != "UNMATCHED" and sub_code not in synced_skus[code]:
                            synced_skus[code].append(sub_code)
    except Exception as e:
        logger.warning("Error reading processing_jobs for SKU sync: %s", str(e))

    # 2. Also check disk storage for any jobs belonging to this user
    try:
        jobs_dir = Path(settings.STORAGE_DIR) / "jobs"
        if jobs_dir.exists():
            for j_dir in jobs_dir.iterdir():
                if j_dir.is_dir():
                    rep_path = j_dir / "processing_report.json"
                    if rep_path.exists():
                        try:
                            with open(rep_path, "r", encoding="utf-8") as rf:
                                rep = json.load(rf)
                                j_id = rep.get("job_id")
                                if j_id:
                                    j_doc = await db.processing_jobs.find_one({"job_id": j_id, "user_id": user_id})
                                    if j_doc:
                                        for m in rep.get("main_skus", []):
                                            code = (m.get("main_sku") or "").strip()
                                            if code and code.upper() != "UNMATCHED":
                                                if code not in synced_skus:
                                                    synced_skus[code] = [code]
                                                for s in m.get("sub_skus", []):
                                                    sub_code = (s.get("sku") or "").strip()
                                                    if sub_code and sub_code.upper() != "UNMATCHED" and sub_code not in synced_skus[code]:
                                                        synced_skus[code].append(sub_code)
                        except Exception:
                            pass
    except Exception as e:
        logger.warning("Error reading disk jobs for SKU sync: %s", str(e))

    # 3. Scan db.master_sheet_labels
    try:
        m_cursor = db.master_sheet_labels.find({"$or": user_filter})
        async for m_lbl in m_cursor:
            m_code = (m_lbl.get("main_sku") or "").strip()
            v_sku = (m_lbl.get("sku") or "").strip()
            if m_code and m_code.upper() != "UNMATCHED":
                if m_code not in synced_skus:
                    synced_skus[m_code] = [m_code]
                if v_sku and v_sku.upper() != "UNMATCHED" and v_sku not in synced_skus[m_code]:
                    synced_skus[m_code].append(v_sku)
    except Exception as e:
        logger.warning("Error reading master_sheet_labels for SKU sync: %s", str(e))

    # 4. Upsert discovered SKUs into db.user_skus
    count = 0
    for code, keywords in synced_skus.items():
        existing = await db.user_skus.find_one({
            "user_id": user_id,
            "sku_code": {"$regex": f"^{re.escape(code)}$", "$options": "i"},
        })
        if existing:
            await db.user_skus.update_one(
                {"_id": existing["_id"]},
                {
                    "$addToSet": {"keywords": {"$each": keywords}},
                    "$set": {"updated_at": now, "is_active": True},
                }
            )
        else:
            await db.user_skus.insert_one({
                "user_id": user_id,
                "sku_code": code,
                "product_name": code,
                "keywords": keywords,
                "aliases": [],
                "priority": 0,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            })
            count += 1

    return count


@router.get(
    "/skus",
    response_model=SKUListResponse,
    summary="List user's personal SKUs",
    description="Retrieve personal SKUs for the authenticated seller with search and pagination.",
)
async def list_skus(
    search: Optional[str] = Query(default=None, description="Search by SKU code, product title, or keyword"),
    is_active: Optional[bool] = Query(default=None, description="Filter by active status"),
    page: int = Query(default=1, ge=1, description="Page number"),
    size: int = Query(default=50, ge=1, le=200, description="Items per page"),
    current_user: dict = Depends(get_current_user),
) -> SKUListResponse:
    """List authenticated user's SKUs with tenant isolation."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    user_id = str(current_user["_id"])
    query: dict = {"user_id": user_id}

    if is_active is not None:
        query["is_active"] = is_active

    if search:
        search_regex = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"sku_code": search_regex},
            {"product_name": search_regex},
            {"keywords": search_regex},
            {"aliases": search_regex},
        ]

    total = await db.user_skus.count_documents(query)

    # Auto-sync from past processed batches if user has 0 SKUs
    if total == 0 and not search:
        synced = await sync_user_skus_from_history(db, user_id)
        if synced > 0:
            total = await db.user_skus.count_documents(query)

    skip = (page - 1) * size

    cursor = (
        db.user_skus.find(query)
        .sort([("priority", -1), ("updated_at", -1)])
        .skip(skip)
        .limit(size)
    )

    items: List[UserSKUResponse] = []
    async for doc in cursor:
        items.append(_doc_to_sku_response(doc))

    return SKUListResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )


@router.post(
    "/skus/sync-from-jobs",
    summary="Sync SKUs from Processed Jobs",
    description="Scans past processing history and imports all detected SKUs into user's Personal SKU Database.",
)
async def sync_skus_from_jobs(
    current_user: dict = Depends(get_current_user),
):
    """Scan and import all SKUs from previous processed batches into user's Personal SKU Database."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    user_id = str(current_user["_id"])
    count = await sync_user_skus_from_history(db, user_id)
    return {
        "success": True,
        "synced_count": count,
        "message": f"Successfully synchronized {count} new SKUs from your processing history."
    }


@router.post(
    "/skus",
    response_model=UserSKUResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new personal SKU",
    description="Add a new SKU with keywords and aliases to the seller's personal database.",
)
async def create_sku(
    payload: UserSKUCreate,
    current_user: dict = Depends(get_current_user),
) -> UserSKUResponse:
    """Create a new SKU with duplicate code detection for current user."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    user_id = str(current_user["_id"])
    sku_code_clean = payload.sku_code.strip()

    # Check for existing SKU with same code for this user
    existing = await db.user_skus.find_one({
        "user_id": user_id,
        "sku_code": {"$regex": f"^{sku_code_clean}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SKU code '{sku_code_clean}' already exists in your personal database.",
        )

    now = datetime.now(timezone.utc)
    # Clean keywords and aliases (if none provided, default to the SKU code itself)
    keywords = [k.strip() for k in payload.keywords if k.strip()]
    if not keywords:
        keywords = [sku_code_clean]
    aliases = [a.strip() for a in payload.aliases if a.strip()]
    product_name_clean = payload.product_name.strip() if payload.product_name else sku_code_clean

    new_doc = {
        "user_id": user_id,
        "sku_code": sku_code_clean,
        "product_name": product_name_clean,
        "keywords": keywords,
        "aliases": aliases,
        "priority": payload.priority,
        "is_active": payload.is_active,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.user_skus.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id

    return _doc_to_sku_response(new_doc)


@router.get(
    "/skus/{sku_id}",
    response_model=UserSKUResponse,
    summary="Get single SKU details",
)
async def get_sku(
    sku_id: str,
    current_user: dict = Depends(get_current_user),
) -> UserSKUResponse:
    """Get single SKU by ID with tenant verification."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    try:
        obj_id = ObjectId(sku_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SKU identifier.")

    doc = await db.user_skus.find_one({"_id": obj_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="SKU not found in your database.")

    return _doc_to_sku_response(doc)


@router.put(
    "/skus/{sku_id}",
    response_model=UserSKUResponse,
    summary="Update personal SKU",
)
async def update_sku(
    sku_id: str,
    payload: UserSKUUpdate,
    current_user: dict = Depends(get_current_user),
) -> UserSKUResponse:
    """Update personal SKU fields."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    try:
        obj_id = ObjectId(sku_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SKU identifier.")

    existing = await db.user_skus.find_one({"_id": obj_id, "user_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="SKU not found in your database.")

    update_fields: dict = {}
    if payload.sku_code is not None:
        sku_clean = payload.sku_code.strip()
        # Check conflict if renaming
        if sku_clean.lower() != existing["sku_code"].lower():
            conflict = await db.user_skus.find_one({
                "user_id": user_id,
                "_id": {"$ne": obj_id},
                "sku_code": {"$regex": f"^{sku_clean}$", "$options": "i"},
            })
            if conflict:
                raise HTTPException(
                    status_code=400,
                    detail=f"SKU code '{sku_clean}' is already used by another SKU in your database.",
                )
        update_fields["sku_code"] = sku_clean

    if payload.product_name is not None:
        update_fields["product_name"] = payload.product_name.strip()
    if payload.keywords is not None:
        update_fields["keywords"] = [k.strip() for k in payload.keywords if k.strip()]
    if payload.aliases is not None:
        update_fields["aliases"] = [a.strip() for a in payload.aliases if a.strip()]
    if payload.priority is not None:
        update_fields["priority"] = payload.priority
    if payload.is_active is not None:
        update_fields["is_active"] = payload.is_active

    now = datetime.now(timezone.utc)
    update_fields["updated_at"] = now

    await db.user_skus.update_one({"_id": obj_id}, {"$set": update_fields})
    updated_doc = await db.user_skus.find_one({"_id": obj_id})
    return _doc_to_sku_response(updated_doc)


@router.delete(
    "/skus/{sku_id}",
    summary="Delete personal SKU",
)
async def delete_sku(
    sku_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete SKU belonging to current user."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    try:
        obj_id = ObjectId(sku_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SKU identifier.")

    res = await db.user_skus.delete_one({"_id": obj_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="SKU not found or already deleted.")

    return {"message": "SKU deleted successfully.", "sku_id": sku_id}


@router.post(
    "/skus/conflict-check",
    response_model=SKUConflictCheckResponse,
    summary="Check existing SKU conflicts",
)
async def check_conflicts(
    payload: SKUConflictCheckRequest,
    current_user: dict = Depends(get_current_user),
) -> SKUConflictCheckResponse:
    """Check which SKU codes from a candidate list already exist in user's database."""
    db = get_db()
    if db is None:
        return SKUConflictCheckResponse(existing_sku_codes=[])

    user_id = str(current_user["_id"])
    codes = [c.strip() for c in payload.sku_codes if c.strip()]
    if not codes:
        return SKUConflictCheckResponse(existing_sku_codes=[])

    existing_docs = await db.user_skus.find({
        "user_id": user_id,
        "sku_code": {"$in": codes},
    }).to_list(length=1000)

    found_codes = [d["sku_code"] for d in existing_docs]
    return SKUConflictCheckResponse(existing_sku_codes=found_codes)


@router.post(
    "/skus/import-csv",
    response_model=SKUImportResult,
    summary="Bulk import SKUs via CSV",
    description="Upload CSV containing 'sku_code', 'product_name', 'keywords', 'aliases', and 'priority' to import/update SKUs.",
)
async def import_skus_csv(
    file: UploadFile = File(..., description="CSV file with SKU definitions"),
    current_user: dict = Depends(get_current_user),
) -> SKUImportResult:
    """Import and upsert SKUs from CSV file."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file appears to be empty or has no header row.")

    # Normalize header column names to lowercase
    field_map = {k.strip().lower(): k for k in reader.fieldnames if k}
    sku_col = field_map.get("sku_code") or field_map.get("sku") or field_map.get("code")
    name_col = field_map.get("product_name") or field_map.get("product") or field_map.get("name") or field_map.get("title")

    if not sku_col:
        raise HTTPException(
            status_code=400,
            detail="CSV must contain a 'sku_code' or 'sku' column header.",
        )

    kw_col = field_map.get("keywords") or field_map.get("keyword") or field_map.get("tags")
    alias_col = field_map.get("aliases") or field_map.get("alias")
    priority_col = field_map.get("priority")
    active_col = field_map.get("is_active") or field_map.get("active")

    imported_count = 0
    updated_count = 0
    errors: List[str] = []
    now = datetime.now(timezone.utc)

    for row_idx, row in enumerate(reader, start=2):
        sku_code = (row.get(sku_col) or "").strip()
        if not sku_code:
            errors.append(f"Row {row_idx}: Skipped due to empty SKU code.")
            continue

        product_name = (row.get(name_col) or sku_code).strip()
        keywords_raw = (row.get(kw_col) or "").strip() if kw_col else ""
        aliases_raw = (row.get(alias_col) or "").strip() if alias_col else ""

        # Parse delimiters (; or ,)
        keywords = [k.strip() for k in keywords_raw.replace(";", ",").split(",") if k.strip()]
        aliases = [a.strip() for a in aliases_raw.replace(";", ",").split(",") if a.strip()]

        priority = 0
        if priority_col and row.get(priority_col):
            try:
                priority = int(str(row[priority_col]).strip())
            except ValueError:
                priority = 0

        is_active = True
        if active_col and row.get(active_col):
            val = str(row[active_col]).strip().lower()
            if val in ("false", "0", "no", "inactive"):
                is_active = False

        # Upsert by sku_code for this user
        existing = await db.user_skus.find_one({
            "user_id": user_id,
            "sku_code": {"$regex": f"^{sku_code}$", "$options": "i"},
        })

        if existing:
            # Merge keywords and aliases
            merged_kw = list(set(existing.get("keywords", []) + keywords))
            merged_al = list(set(existing.get("aliases", []) + aliases))
            await db.user_skus.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "product_name": product_name or existing.get("product_name"),
                        "keywords": merged_kw,
                        "aliases": merged_al,
                        "priority": priority if priority != 0 else existing.get("priority", 0),
                        "is_active": is_active,
                        "updated_at": now,
                    }
                },
            )
            updated_count += 1
        else:
            await db.user_skus.insert_one({
                "user_id": user_id,
                "sku_code": sku_code,
                "product_name": product_name,
                "keywords": keywords,
                "aliases": aliases,
                "priority": priority,
                "is_active": is_active,
                "created_at": now,
                "updated_at": now,
            })
            imported_count += 1

    return SKUImportResult(
        imported_count=imported_count,
        updated_count=updated_count,
        total_processed=imported_count + updated_count,
        errors=errors[:10],  # Return up to 10 errors
    )


@router.get(
    "/skus/export-csv",
    summary="Export personal SKUs to CSV",
    description="Download a CSV backup of the seller's entire personal SKU database.",
)
async def export_skus_csv(
    current_user: dict = Depends(get_current_user),
):
    """Generate CSV stream of all user SKUs."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user_id = str(current_user["_id"])
    cursor = db.user_skus.find({"user_id": user_id}).sort("sku_code", 1)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "sku_code",
        "product_name",
        "keywords",
        "aliases",
        "priority",
        "is_active",
        "created_at",
    ])

    async for doc in cursor:
        writer.writerow([
            doc.get("sku_code", ""),
            doc.get("product_name", ""),
            "; ".join(doc.get("keywords", [])),
            "; ".join(doc.get("aliases", [])),
            doc.get("priority", 0),
            "true" if doc.get("is_active", True) else "false",
            doc.get("created_at", "").isoformat() if isinstance(doc.get("created_at"), datetime) else "",
        ])

    csv_data = output.getvalue()
    filename = f"labelflow_skus_{user_id[:8]}_{datetime.now().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
