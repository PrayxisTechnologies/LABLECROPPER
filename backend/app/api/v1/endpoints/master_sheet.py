"""Master Sheet endpoints for viewing, searching, and exporting all cropped labels."""

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
import fitz

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.schemas.master_sheet import MasterSheetResponse
from app.services.master_sheet.service import master_sheet_service

router = APIRouter()
settings = get_settings()


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
