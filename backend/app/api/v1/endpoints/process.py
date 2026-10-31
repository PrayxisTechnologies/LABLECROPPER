"""PDF Batch Processing and Output Artifact Download Endpoints."""

import asyncio
import json
import re
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
import fitz  # PyMuPDF

from app.api.deps import get_optional_current_user
from app.core.config import get_settings
from app.core.errors import MaxFilesExceededException
from app.core.logging import logger
from app.db.mongodb import get_db
from app.schemas.processing import (
    CourierSummary,
    ExtractedSKU,
    LabelOutputFormat,
    MainSkuSummary,
    MarketplaceSummary,
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
from app.services.sku_intelligence.engine import SKUIntelligenceEngine

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
    current_user: Optional[dict] = Depends(get_optional_current_user),
) -> UploadInspectionResponse:
    """Instantly parse and group SKUs into Main SKUs (e.g. GREEN, BROWN) and summarize couriers before cropping."""
    settings = get_settings()

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No PDF files provided.",
        )

    if settings.MAX_UPLOAD_FILES > 0 and len(files) > settings.MAX_UPLOAD_FILES:
        raise MaxFilesExceededException(
            max_files=settings.MAX_UPLOAD_FILES,
            received_count=len(files),
        )

    # Load authenticated user's SKU intelligence if available
    sku_engine: Optional[SKUIntelligenceEngine] = None
    u_skus: Optional[List[dict]] = None
    if current_user:
        db = get_db()
        if db is not None:
            user_id = str(current_user["_id"])
            from app.api.v1.endpoints.skus import _get_user_clauses
            user_clauses = _get_user_clauses(user_id, current_user.get("email"))
            try:
                u_skus, u_decisions = await asyncio.gather(
                    db.user_skus.find({
                        "$or": user_clauses,
                        "is_active": {"$ne": False},
                    }).to_list(length=1000),
                    db.sku_decisions.find({"$or": user_clauses}).to_list(length=500),
                )
            except Exception:
                u_skus, u_decisions = [], []
            if u_skus:
                sku_engine = SKUIntelligenceEngine(user_skus=u_skus, user_decisions=u_decisions)

    total_pages = 0
    total_labels = 0
    raw_label_items: List[dict] = []
    courier_counts: dict[str, int] = {}
    marketplace_counts: dict[str, int] = {}

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
            full_raw_text = page.get_text("text")
            top_header_clip = fitz.Rect(0, 0, p_rect.width, min(p_rect.height, 180.0))
            top_header_text = page.get_text("text", clip=top_header_clip).strip()

            # Check Marketplace-specific layouts FIRST so Snapdeal/Flipkart are never chopped as Meesho
            if pdf_inspector.is_snapdeal_label(top_header_text, full_raw_text):
                mp_name = "Snapdeal"
                sd_rect = pdf_inspector.detect_snapdeal_label_rect(page, p_rect.width, p_rect.height)
                page_text = page.get_text("text", clip=sd_rect)
                if not page_text.strip() or len(page_text.strip()) < 30:
                    page_text = full_raw_text
                header_sample = page_text[:1200]
            elif pdf_inspector.is_flipkart_label(top_header_text, full_raw_text):
                mp_name = "Flipkart"
                fk_rect = pdf_inspector.detect_flipkart_label_rect(page, p_rect.width, p_rect.height)
                page_text = page.get_text("text", clip=fk_rect)
                if not page_text.strip() or len(page_text.strip()) < 30:
                    page_text = full_raw_text
                header_sample = page_text[:1200]
            else:
                is_meesho_a4 = abs(p_rect.width - 595.0) <= 25.0 and abs(p_rect.height - 842.0) <= 25.0
                
                # Fast clipped text extraction: Dynamically extract shipping label area up to TAX INVOICE.
                # This completely skips parsing the dense lower tax invoice table, boosting scan speed 5x.
                crop_limit_y = (
                    pdf_inspector.detect_tax_invoice_separator(page, p_rect.width, p_rect.height) + 10.0
                    if is_meesho_a4
                    else p_rect.height
                )
                clip_box = fitz.Rect(0, 0, p_rect.width, crop_limit_y)
                page_text = page.get_text("text", clip=clip_box)
                if not page_text.strip():
                    page_text = full_raw_text

                # Check if this page has shipping indicators (skip standalone invoice pages)
                header_sample = page_text[:1200]
                if not RE_SHIPPING_INDICATORS.search(header_sample):
                    full_sample = full_raw_text[:1000]
                    if RE_TAX_INVOICE_HEADER.search(full_sample) or RE_INVOICE_TABLE_START.search(full_sample):
                        continue

                # Per-page marketplace platform detection
                if "amazon" in full_raw_text.lower():
                    mp_name = "Amazon"
                elif "myntra" in full_raw_text.lower():
                    mp_name = "Myntra"
                else:
                    mp_name = "Meesho"

            total_labels += 1

            # High-speed courier detection
            courier, _ = courier_sorter_service.detect_courier(
                text=page_text,
                header_text=header_sample,
            )
            courier_counts[courier] = courier_counts.get(courier, 0) + 1
            marketplace_counts[mp_name] = marketplace_counts.get(mp_name, 0) + 1

            # High-speed SKU extraction
            sku_items, order_id = picklist_generator_service.extract_skus(page_text)
            if sku_engine:
                raw_cand = sku_items[0].sku if sku_items else None
                matched_sku, match_type, conf, _, _ = sku_engine.match_label_text(
                    page_text,
                    candidate_sku=raw_cand if raw_cand != "UNMATCHED" else None,
                )
                if matched_sku:
                    intel_sku = ExtractedSKU(
                        sku=raw_cand if raw_cand and raw_cand != "UNMATCHED" else matched_sku,
                        quantity=sku_items[0].quantity if sku_items else 1,
                        description=matched_sku,
                        order_id=order_id,
                        match_type=match_type,
                        confidence=conf,
                    )
                    sku_items = [intel_sku]

            raw_label_items.append({
                "courier": courier,
                "order_id": order_id,
                "sku_items": sku_items,
                "raw_text": page_text,
                "marketplace": mp_name,
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

    # Compile Marketplace Breakdown
    marketplace_breakdown: List[MarketplaceSummary] = []
    for m_name, count in sorted(marketplace_counts.items(), key=lambda x: -x[1]):
        pct = round((count / total_labels * 100), 1) if total_labels > 0 else 0.0
        marketplace_breakdown.append(
            MarketplaceSummary(
                marketplace=m_name,
                label_count=count,
                percentage=pct,
            )
        )

    # Compile Main SKUs (e.g. GREEN, BROWN) and All Sub-SKUs, prioritizing user's saved SKUs
    main_skus, all_skus = picklist_generator_service.group_skus_for_inspection(
        raw_label_items,
        sku_engine=sku_engine,
        user_skus=u_skus,
    )

    return UploadInspectionResponse(
        total_files=len(files),
        total_pages=total_pages,
        total_labels=total_labels,
        courier_breakdown=courier_breakdown,
        marketplace_breakdown=marketplace_breakdown,
        main_skus=main_skus,
        all_skus=all_skus,
    )


def _parse_exclusion_list(param_val: Optional[str]) -> List[str]:
    """Parse JSON array or comma-separated string of exclusion identifiers."""
    if not param_val:
        return []
    try:
        parsed = json.loads(param_val)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass
    return [x.strip() for x in param_val.split(",") if x.strip()]


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
    excluded_main_skus: Optional[str] = Form(
        default=None,
        description="JSON or comma-separated list of Main SKUs to exclude from output PDF",
    ),
    excluded_skus: Optional[str] = Form(
        default=None,
        description="JSON or comma-separated list of individual SKU variants to exclude from output PDF",
    ),
    excluded_couriers: Optional[str] = Form(
        default=None,
        description="JSON or comma-separated list of delivery partners to exclude from output PDF",
    ),
    excluded_order_ids: Optional[str] = Form(
        default=None,
        description="JSON or comma-separated list of Order IDs / AWB numbers to exclude from output PDF",
    ),
    excluded_marketplaces: Optional[str] = Form(
        default=None,
        description="JSON or comma-separated list of marketplace platforms to exclude from output PDF",
    ),
    smart_sku_detection: bool = Form(
        default=False,
        description="Enable Smart SKU detection and grouping for unrecognized variants",
    ),
    recent_job_ids: Optional[str] = Form(
        default=None,
        description="JSON or comma-separated list of recent job IDs from client history for duplicate detection",
    ),
    marketplace: Optional[str] = Form(
        default=None,
        description="Marketplace platform name (Meesho, Flipkart, Amazon, Myntra, Snapdeal)",
    ),
    current_user: Optional[dict] = Depends(get_optional_current_user),
) -> ProcessingJobResponse:
    """Execute complete Meesho label cropping, courier sorting, and picklist workflow."""
    settings = get_settings()

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No PDF files provided in the processing request.",
        )

    if settings.MAX_UPLOAD_FILES > 0 and len(files) > settings.MAX_UPLOAD_FILES:
        raise MaxFilesExceededException(
            max_files=settings.MAX_UPLOAD_FILES,
            received_count=len(files),
        )

    config = ProcessingConfig(
        output_format=output_format,
        sort_by=sort_by,
        remove_invoice=remove_invoice,
        enable_sku_picklist=enable_sku_picklist,
        excluded_main_skus=_parse_exclusion_list(excluded_main_skus),
        excluded_skus=_parse_exclusion_list(excluded_skus),
        excluded_couriers=_parse_exclusion_list(excluded_couriers),
        excluded_order_ids=_parse_exclusion_list(excluded_order_ids),
        excluded_marketplaces=_parse_exclusion_list(excluded_marketplaces),
        smart_sku_detection=smart_sku_detection,
    )

    # Fetch user's personal SKU database and saved decisions if authenticated
    user_skus = None
    user_decisions = None
    user_id = None
    if current_user:
        user_id = str(current_user["_id"])
        db = get_db()
        if db is not None:
            from app.api.v1.endpoints.skus import _get_user_clauses
            user_clauses = _get_user_clauses(user_id, current_user.get("email"))
            try:
                user_skus, user_decisions = await asyncio.wait_for(
                    asyncio.gather(
                        db.user_skus.find({
                            "$or": user_clauses,
                            "is_active": {"$ne": False},
                        }).to_list(length=1000),
                        db.sku_decisions.find({"$or": user_clauses}).to_list(length=500),
                    ),
                    timeout=1.0,
                )
            except Exception:
                user_skus, user_decisions = [], []

    try:
        result = await batch_processor.process_batch(
            files=files,
            config=config,
            user_skus=user_skus,
            user_decisions=user_decisions,
            user_id=user_id,
            marketplace=marketplace,
            recent_job_ids=_parse_exclusion_list(recent_job_ids),
        )
        return result
    except Exception as exc:
        logger.error("Batch processing failed with error: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Label processing failed: {str(exc)}",
        )


def _safe_job_path(job_id: str, filename: Optional[str] = None) -> Path:
    """Validate job ID against regex to prevent path traversal attacks and ensure the path stays in storage."""
    if not job_id or not re.match(r"^[a-zA-Z0-9_\-]+$", job_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job identifier format.",
        )
    settings = get_settings()
    base_dir = (Path(settings.STORAGE_DIR) / "jobs").resolve()
    target_dir = (base_dir / job_id).resolve()
    if not str(target_dir).startswith(str(base_dir)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden.",
        )
    if filename:
        file_path = (target_dir / filename).resolve()
        if not str(file_path).startswith(str(target_dir)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden.",
            )
        return file_path
    return target_dir


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
    job_dir = _safe_job_path(job_id)

    if not job_dir.exists() or not job_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found or has expired.",
        )

    if artifact_type == "pdf":
        file_path = _safe_job_path(job_id, "labels_thermal_4x6.pdf")
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thermal PDF was not generated for this job.",
            )
        fn_file = job_dir / "formatted_name.txt"
        pdf_name = fn_file.read_text(encoding="utf-8").strip() if fn_file.exists() else f"labels_{job_id}.pdf"
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=pdf_name,
        )

    elif artifact_type == "picklist":
        file_path = _safe_job_path(job_id, "sku_picklist.csv")
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
        file_path = _safe_job_path(job_id, "processing_report.json")
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
    pdf_path = _safe_job_path(job_id, "labels_thermal_4x6.pdf")

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
    file_path = _safe_job_path(job_id, "labels_thermal_4x6.pdf")

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thermal PDF was not generated or has expired for this job.",
        )

    fn_file = file_path.parent / "formatted_name.txt"
    inline_name = fn_file.read_text(encoding="utf-8").strip() if fn_file.exists() else f"labels_{job_id}.pdf"
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{inline_name}"'},
    )


@router.get(
    "/labels/jobs/{job_id}/status",
    response_model=ProcessingJobResponse,
    summary="Get Job Audit Details",
    description="Fetch full status and metrics for a completed job.",
)
async def get_job_status(job_id: str) -> ProcessingJobResponse:
    """Fetch stored job report."""
    report_path = _safe_job_path(job_id, "processing_report.json")

    if not report_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return ProcessingJobResponse.model_validate(data)


@router.get(
    "/extension/download",
    summary="Download Chrome Extension (.zip)",
    description="Packages and streams the latest LabelFlow Chrome Extension ZIP for 1-click browser install.",
)
async def download_extension_zip():
    """Dynamically packages the extension directory into a ZIP archive and streams it for download."""
    import io
    import zipfile

    candidates = [
        Path(__file__).resolve().parents[5] / "extension",
        Path.cwd().parent / "extension",
        Path.cwd() / "extension",
        Path("/home/ubuntu/labelflow/extension"),
        Path.cwd().resolve().parent / "extension",
        Path(__file__).resolve().parents[4] / "extension",
    ]
    ext_dir = None
    for c in candidates:
        if c.exists() and (c / "manifest.json").exists():
            ext_dir = c
            break

    if not ext_dir:
        logger.error("Extension directory not found! Checked: %s", [str(c) for c in candidates])
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="LabelFlow Extension package directory was not found on server.",
        )

    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in ext_dir.rglob("*"):
            if f.is_file() and not f.name.endswith(".zip") and not f.name.startswith("."):
                arcname = f.relative_to(ext_dir)
                zf.write(f, arcname=str(arcname))

    mem_zip.seek(0)
    return Response(
        content=mem_zip.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="LabelFlow-Chrome-Extension.zip"',
            "Cache-Control": "no-cache",
        },
    )
