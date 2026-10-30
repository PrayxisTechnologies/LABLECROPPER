"""Master Sheet endpoints for viewing, searching, and exporting all cropped labels."""

from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
import fitz

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.mongodb import ObjectId, get_db
from app.schemas.master_sheet import MasterSheetResponse
from app.services.master_sheet.service import master_sheet_service

router = APIRouter()
settings = get_settings()


class BulkMasterLabelsRequest(BaseModel):
    """Request payload for bulk operating on selected master labels."""

    label_ids: List[str] = Field(..., description="List of master label IDs to process")


def _get_user_clauses(user_id: str) -> List[Dict[str, Any]]:
    clauses: List[Dict[str, Any]] = [{"user_id": str(user_id)}]
    if ObjectId.is_valid(user_id):
        clauses.append({"user_id": ObjectId(user_id)})
    return clauses


@router.get(
    "/master-sheet",
    response_model=MasterSheetResponse,
    summary="Get Seller Master Sheet",
    description="Retrieve all processed labels with deduplication by Order ID, showing SKU, WBL ID, courier, and PDF locations.",
)
async def get_master_sheet(
    search: Optional[str] = Query(default=None, description="Search by Order ID, SKU, or WBL tracking ID"),
    courier: Optional[str] = Query(default=None, description="Filter by delivery courier partner"),
    marketplace: Optional[str] = Query(default=None, description="Filter by marketplace"),
    days: Optional[str] = Query(default="all", description="Filter by date range (all, today, yesterday, 7days, 30days, this_month)"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=25, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> MasterSheetResponse:
    """Query seller's Master Sheet database."""
    user_id = str(current_user["_id"])
    return await master_sheet_service.get_master_sheet(
        user_id=user_id,
        search=search,
        courier=courier,
        marketplace=marketplace,
        days=days,
        page=page,
        size=size,
    )


@router.get(
    "/master-sheet/export-csv",
    summary="Export Master Sheet as CSV",
    description="Download complete consolidated Master Sheet CSV file.",
)
async def export_master_sheet_csv(
    search: Optional[str] = Query(default=None),
    courier: Optional[str] = Query(default=None),
    marketplace: Optional[str] = Query(default=None),
    days: Optional[str] = Query(default="all"),
    current_user: dict = Depends(get_current_user),
):
    """Download seller's Master Sheet catalog as CSV."""
    user_id = str(current_user["_id"])
    csv_content = await master_sheet_service.export_master_sheet_csv(
        user_id=user_id,
        search=search,
        courier=courier,
        marketplace=marketplace,
        days=days,
    )
    if not csv_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No labels found in Master Sheet.",
        )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="labelflow_master_sheet.csv"',
        },
    )


@router.post(
    "/master-sheet/sync-from-history",
    summary="Sync Master Sheet from Processing History",
    description="Scans user's past processing jobs and auto-populates any missing label records into the Master Sheet.",
)
async def sync_master_sheet(
    current_user: dict = Depends(get_current_user),
):
    """Explicitly trigger backfill / sync from user's processing history."""
    user_id = str(current_user["_id"])
    synced_count = await master_sheet_service.sync_master_sheet_from_history(user_id=user_id, force=True)
    return {
        "message": f"Successfully synced {synced_count} label records from processing history.",
        "synced_count": synced_count,
    }


@router.delete(
    "/master-sheet/{label_id}",
    summary="Delete Master Sheet Label Record",
    description="Deletes an individual label record from the seller's Master Sheet.",
)
async def delete_master_label(
    label_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a single label entry from Master Sheet."""
    user_id = str(current_user["_id"])
    success = await master_sheet_service.delete_single_label(user_id=user_id, label_id=label_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Label record not found or already deleted.",
        )
    return {"message": "Label record deleted successfully."}


@router.delete(
    "/master-sheet",
    summary="Clear Master Sheet",
    description="Clear all or platform-specific records from Master Sheet.",
)
async def clear_master_sheet(
    marketplace: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Clear master sheet labels."""
    user_id = str(current_user["_id"])
    deleted_count = await master_sheet_service.clear_master_sheet(
        user_id=user_id, marketplace=marketplace
    )
    return {
        "message": f"Successfully cleared {deleted_count} records from Master Sheet.",
        "deleted_count": deleted_count,
    }


@router.get(
    "/labels/jobs/{job_id}/page/{page_number}/print-pdf",
    summary="Print Single 4x6 Label",
    description="Extracts a single 4x6 thermal page from a batch PDF for immediate direct printing.",
)
async def print_single_label_pdf(
    job_id: str,
    page_number: int,
):
    """Serve a single thermal page as a standalone PDF for 1-click browser printing."""
    pdf_path = Path(settings.STORAGE_DIR) / "jobs" / job_id / "labels_thermal_4x6.pdf"
    if not pdf_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Thermal PDF for batch '{job_id}' not found.",
        )

    try:
        src_doc = fitz.open(str(pdf_path))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to open PDF: {str(e)}",
        )

    try:
        total_pages = len(src_doc)
        if page_number < 1 or page_number > total_pages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Page number {page_number} is out of range (1 to {total_pages}).",
            )

        # Slice exact single page into a new 4x6 PDF document
        single_doc = fitz.open()
        single_doc.insert_pdf(src_doc, from_page=page_number - 1, to_page=page_number - 1)
        pdf_bytes = single_doc.tobytes(garbage=0, deflate=False)
        single_doc.close()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="label_{job_id}_page_{page_number}.pdf"',
            },
        )
    finally:
        src_doc.close()


@router.post(
    "/master-sheet/bulk-delete",
    summary="Bulk Delete Selected Master Sheet Labels",
    description="Deletes multiple selected label records from the seller's Master Sheet.",
)
async def bulk_delete_master_labels(
    payload: BulkMasterLabelsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Bulk delete selected master labels."""
    user_id = str(current_user["_id"])
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable.",
        )

    if not payload.label_ids:
        return {"message": "No labels specified.", "deleted_count": 0}

    user_clauses = _get_user_clauses(user_id)
    raw_ids = [ObjectId(lid) for lid in payload.label_ids if ObjectId.is_valid(lid)]
    str_ids = [str(lid) for lid in payload.label_ids]

    query = {
        "$and": [
            {"$or": user_clauses},
            {"$or": [{"_id": {"$in": raw_ids}}, {"_id": {"$in": str_ids}}]},
        ]
    }
    res = await db.master_labels.delete_many(query)
    return {
        "message": f"Successfully deleted {res.deleted_count} selected label records.",
        "deleted_count": res.deleted_count,
    }


@router.post(
    "/master-sheet/print-selected",
    summary="Print Merged PDF for Selected Master Labels",
    description="Extracts the thermal 4x6 pages for all selected labels and merges them into a single printable PDF.",
)
async def print_selected_master_labels(
    payload: BulkMasterLabelsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a merged print-ready PDF containing only the selected labels."""
    user_id = str(current_user["_id"])
    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable.",
        )

    if not payload.label_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No labels selected for printing.",
        )

    user_clauses = _get_user_clauses(user_id)
    raw_ids = [ObjectId(lid) for lid in payload.label_ids if ObjectId.is_valid(lid)]
    str_ids = [str(lid) for lid in payload.label_ids]

    query = {
        "$and": [
            {"$or": user_clauses},
            {"$or": [{"_id": {"$in": raw_ids}}, {"_id": {"$in": str_ids}}]},
        ]
    }

    cursor = db.master_labels.find(query)
    labels = await cursor.to_list(length=1000)
    if not labels:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching labels found for selection.",
        )

    merged_doc = fitz.open()
    cache_docs = {}

    try:
        for lbl in labels:
            appearances = lbl.get("appearances") or []
            if not appearances:
                continue

            # Pick latest appearance
            app = appearances[-1]
            job_id = app.get("job_id")
            page_num = app.get("page_number", 1)

            if not job_id:
                continue

            pdf_path = Path(settings.STORAGE_DIR) / "jobs" / job_id / "labels_thermal_4x6.pdf"
            if not pdf_path.exists():
                continue

            if job_id not in cache_docs:
                try:
                    cache_docs[job_id] = fitz.open(str(pdf_path))
                except Exception:
                    continue

            src_doc = cache_docs[job_id]
            total_pages = len(src_doc)
            if 1 <= page_num <= total_pages:
                merged_doc.insert_pdf(src_doc, from_page=page_num - 1, to_page=page_num - 1)

        if len(merged_doc) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Selected label PDF files could not be located in storage.",
            )

        pdf_bytes = merged_doc.tobytes(garbage=0, deflate=False)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'inline; filename="selected_labels_print.pdf"',
            },
        )
    finally:
        merged_doc.close()
        for doc in cache_docs.values():
            try:
                doc.close()
            except Exception:
                pass

