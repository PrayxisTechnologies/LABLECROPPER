"""PDF Batch Processing and Output Artifact Download Endpoints."""

import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
import fitz  # PyMuPDF

from app.core.config import get_settings
from app.core.errors import MaxFilesExceededException
from app.core.logging import logger
from app.schemas.processing import (
    CourierSummary,
    LabelOutputFormat,
    MainSkuSummary,
    ProcessingConfig,
    ProcessingJobResponse,
    SortCriterion,
    SubSkuSummary,
    UploadInspectionResponse,
)
from app.services.pdf.courier_sorter import courier_sorter_service
from app.services.pdf.inspector import (
    pdf_inspector,
    RE_INVOICE_TABLE_START,
    RE_SHIPPING_INDICATORS,
    RE_TAX_INVOICE_HEADER,
)
from app.services.pdf.processor import batch_processor
from app.services.pdf.validator import pdf_validator_service
from app.services.picklist.generator import picklist_generator_service

router = APIRouter()


@router.post(
    "/labels/inspect-upload",
    response_model=UploadInspectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspect Uploaded PDF Batch",
    description="Instantly scans uploaded PDFs before cropping to extract parent Main SKUs, all sub-SKUs, and delivery partners.",
)
async def inspect_uploaded_labels(
    files: List[UploadFile] = File(
        ...,
        description="One or more Meesho PDF documents to inspect before cropping",
    ),
) -> UploadInspectionResponse:
    """Instantly parse and group SKUs into Main SKUs (e.g. GREEN, BROWN) and summarize couriers before cropping."""
    settings = get_settings()

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No PDF files provided.",
        )

    if len(files) > settings.MAX_UPLOAD_FILES:
        raise MaxFilesExceededException(
            max_files=settings.MAX_UPLOAD_FILES,
            received_count=len(files),
        )

    total_pages = 0
    total_labels = 0
    raw_label_items: List[dict] = []
    courier_counts: dict[str, int] = {}

    for file in files:
        filename = file.filename or "unknown.pdf"
        validation_item, raw_bytes = await pdf_validator_service.validate_uploaded_file(file)
        if not validation_item.is_valid:
            continue

        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
        except Exception as e:
            logger.warning("Failed to open PDF %s for inspection: %s", filename, str(e))
            continue

        num_pages = len(doc)
        total_pages += num_pages

        for pno in range(num_pages):
            page = doc[pno]
            p_rect = page.rect
            is_meesho_a4 = abs(p_rect.width - 595.0) <= 25.0 and abs(p_rect.height - 842.0) <= 25.0
            
            # Fast clipped text extraction: Only extract upper 385 pt (shipping label area).
            # This completely skips parsing the dense lower tax invoice table, boosting scan speed 5x.
            clip_box = fitz.Rect(0, 0, p_rect.width, 385.0 if is_meesho_a4 else p_rect.height)
            page_text = page.get_text("text", clip=clip_box)
            if not page_text.strip():
                page_text = page.get_text("text")

            # Check if this page has shipping indicators (skip standalone invoice pages)
            header_sample = page_text[:1200]
            if not RE_SHIPPING_INDICATORS.search(header_sample):
                full_sample = page.get_text("text")[:1000]
                if RE_TAX_INVOICE_HEADER.search(full_sample) or RE_INVOICE_TABLE_START.search(full_sample):
                    continue

            total_labels += 1

            # High-speed courier detection
            courier, _ = courier_sorter_service.detect_courier(
                text=page_text,
                header_text=header_sample,
            )
            courier_counts[courier] = courier_counts.get(courier, 0) + 1

            # High-speed SKU extraction
            sku_items, order_id = picklist_generator_service.extract_skus(page_text)
            raw_label_items.append({
                "courier": courier,
                "order_id": order_id,
                "sku_items": sku_items,
            })

        doc.close()

    # Compile Courier Breakdown
    courier_breakdown: List[CourierSummary] = []
    for c_name, count in sorted(courier_counts.items(), key=lambda x: -x[1]):
        pct = round((count / total_labels * 100), 1) if total_labels > 0 else 0.0
        courier_breakdown.append(
            CourierSummary(
                courier=c_name,
                label_count=count,
                percentage=pct,
            )
        )

    # Compile Main SKUs (e.g. GREEN, BROWN) and All Sub-SKUs
    main_skus, all_skus = picklist_generator_service.group_skus_for_inspection(raw_label_items)

    return UploadInspectionResponse(
        total_files=len(files),
        total_pages=total_pages,
        total_labels=total_labels,
        courier_breakdown=courier_breakdown,
        main_skus=main_skus,
        all_skus=all_skus,
    )


@router.post(
    "/labels/process",
    response_model=ProcessingJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Process Meesho PDF Batch",
    description="Processes Meesho shipping label PDFs: crops 4x6 thermal labels, separates invoices, sorts by courier, and generates SKU picklist.",
)
async def process_labels(
    files: List[UploadFile] = File(
        ...,
        description="One or more Meesho shipping label PDF documents",
    ),
    output_format: LabelOutputFormat = Form(
        default=LabelOutputFormat.THERMAL_4X6,
        description="Target dimensions and format",
    ),
    sort_by: SortCriterion = Form(
        default=SortCriterion.SKU_COURIER,
        description="Batch sorting criterion ('sku_courier', 'original_order', 'sku', 'courier_partner')",
    ),
    remove_invoice: bool = Form(
        default=True,
        description="Safely detect and filter tax invoice pages/sections",
    ),
    enable_sku_picklist: bool = Form(
        default=False,
        description="Compile consolidated SKU picklist CSV (automatically true for SKU sorting)",
    ),
) -> ProcessingJobResponse:
    """Execute complete Meesho label cropping, courier sorting, and picklist workflow."""
    settings = get_settings()

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No PDF files provided in the processing request.",
        )

    if len(files) > settings.MAX_UPLOAD_FILES:
        raise MaxFilesExceededException(
            max_files=settings.MAX_UPLOAD_FILES,
            received_count=len(files),
        )

    config = ProcessingConfig(
        output_format=output_format,
        sort_by=sort_by,
        remove_invoice=remove_invoice,
        enable_sku_picklist=enable_sku_picklist,
    )

    result = await batch_processor.process_batch(files, config)
    return result


@router.get(
    "/labels/jobs/{job_id}/download/{artifact_type}",
    summary="Download Processed Output Artifact",
    description="Download the generated 4x6 thermal PDF, SKU picklist CSV, or JSON audit report.",
)
async def download_job_artifact(
    job_id: str,
    artifact_type: str,
):
    """Retrieve generated output files for a completed processing job."""
    settings = get_settings()
    job_dir = Path(settings.STORAGE_DIR) / "jobs" / job_id

    if not job_dir.exists() or not job_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found or has expired.",
        )

    if artifact_type == "pdf":
        file_path = job_dir / "labels_thermal_4x6.pdf"
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thermal PDF was not generated for this job.",
            )
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=f"meesho_thermal_4x6_{job_id}.pdf",
        )

    elif artifact_type == "picklist":
        file_path = job_dir / "sku_picklist.csv"
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SKU picklist was not generated or disabled for this job.",
            )
        return FileResponse(
            path=str(file_path),
            media_type="text/csv",
            filename=f"meesho_picklist_{job_id}.csv",
        )

    elif artifact_type == "report":
        file_path = job_dir / "processing_report.json"
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Processing report not found for this job.",
            )
        return FileResponse(
            path=str(file_path),
            media_type="application/json",
            filename=f"meesho_report_{job_id}.json",
        )

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown artifact type '{artifact_type}'. Expected 'pdf', 'picklist', or 'report'.",
        )


@router.get(
    "/labels/jobs/{job_id}/preview/page/{page_number}",
    summary="Get 4x6 Label Page Preview",
    description="Renders a crisp PNG thumbnail image of the specified 1-indexed output thermal page.",
)
async def get_page_preview(
    job_id: str,
    page_number: int,
):
    """Render a single 4x6 thermal page as a PNG image for live browser preview."""
    settings = get_settings()
    pdf_path = Path(settings.STORAGE_DIR) / "jobs" / job_id / "labels_thermal_4x6.pdf"

    if not pdf_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Thermal PDF for job '{job_id}' not found.",
        )

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to open thermal PDF: {str(e)}",
        )

    try:
        total_pages = len(doc)
        if page_number < 1 or page_number > total_pages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Page number {page_number} is out of range (1 to {total_pages}).",
            )

        page = doc[page_number - 1]
        pix = page.get_pixmap(dpi=150)
        png_bytes = pix.tobytes("png")
        return Response(content=png_bytes, media_type="image/png")
    finally:
        doc.close()


@router.get(
    "/labels/jobs/{job_id}/view/pdf",
    summary="View Thermal PDF Inline",
    description="Serves the 4x6 thermal PDF with inline Content-Disposition for browser preview.",
)
async def view_job_pdf(job_id: str):
    """Serve thermal PDF for in-browser iframe/object viewing without forcing attachment download."""
    settings = get_settings()
    file_path = Path(settings.STORAGE_DIR) / "jobs" / job_id / "labels_thermal_4x6.pdf"

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thermal PDF was not generated or has expired for this job.",
        )

    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="meesho_thermal_4x6_{job_id}.pdf"'},
    )


@router.get(
    "/labels/jobs/{job_id}/status",
    response_model=ProcessingJobResponse,
    summary="Get Job Audit Details",
    description="Fetch full status and metrics for a completed job.",
)
async def get_job_status(job_id: str) -> ProcessingJobResponse:
    """Fetch stored job report."""
    settings = get_settings()
    report_path = Path(settings.STORAGE_DIR) / "jobs" / job_id / "processing_report.json"

    if not report_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return ProcessingJobResponse.model_validate(data)
