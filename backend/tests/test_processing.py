"""Comprehensive automated tests for Phase 2 Meesho PDF Processing Engine."""

import io
from pathlib import Path
from fastapi.testclient import TestClient
import fitz  # PyMuPDF
from app.main import app
from app.services.pdf.cropper import THERMAL_HEIGHT_PT, THERMAL_WIDTH_PT

client = TestClient(app)


def create_mock_meesho_pdf(
    pages_spec: list[dict],
) -> bytes:
    """Helper to synthesize mock Meesho PDFs with precise layouts, text blocks, and dimensions.

    Each spec in pages_spec can specify:
    - width (default 595.0 A4)
    - height (default 842.0 A4)
    - top_text: text to insert in top quadrant
    - bottom_text: text to insert in bottom quadrant
    - rotation: 0, 90, etc.
    """
    doc = fitz.open()
    for spec in pages_spec:
        w = spec.get("width", 595.0)
        h = spec.get("height", 842.0)
        page = doc.new_page(width=w, height=h)
        if "rotation" in spec:
            page.set_rotation(spec["rotation"])

        top_text = spec.get("top_text")
        if top_text:
            page.insert_text(fitz.Point(30, 50), top_text, fontsize=11)

        bottom_text = spec.get("bottom_text")
        if bottom_text:
            page.insert_text(fitz.Point(30, h * 0.55 + 30), bottom_text, fontsize=10)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_process_split_meesho_label_with_invoice():
    """Verify standard Meesho A4 split page: top shipping label with invoice removed, 4x6 output."""
    split_page = {
        "width": 595.0,
        "height": 842.0,
        "top_text": (
            "DELHIVERY SURFACE\n"
            "AWB: 128471928371\n"
            "Ship To: Priya Sharma\n"
            "Flat 402, Green Valley Apartments, Andheri West\n"
            "Mumbai, Maharashtra - 400053\n"
            "SKU: BLU_KURTI_XL\n"
            "Qty: 2\n"
            "Order No: MSH-948192\n"
        ),
        "bottom_text": (
            "TAX INVOICE\n"
            "Original for Recipient\n"
            "GSTIN: 27AABCU9603R1ZM\n"
            "Invoice No: INV-2026-9041\n"
            "Taxable Value: 899.00\n"
            "IGST: 161.82\n"
            "Total Amount: 1060.82\n"
        ),
    }

    pdf_bytes = create_mock_meesho_pdf([split_page])
    files = [("files", ("meesho_batch_1.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={
            "output_format": "4x6_thermal",
            "sort_by": "courier_partner",
            "remove_invoice": "true",
            "enable_sku_picklist": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["job_id"].startswith("job_")
    assert data["total_files"] == 1
    assert data["total_input_pages"] == 1
    assert data["total_labels_generated"] == 1
    assert data["total_invoices_removed"] == 1
    assert data["total_pages_flagged"] == 0

    # Verify courier extraction
    assert len(data["courier_breakdown"]) == 1
    assert data["courier_breakdown"][0]["courier"] == "Delhivery"
    assert data["courier_breakdown"][0]["label_count"] == 1

    # Verify SKU extraction and picklist
    assert len(data["picklist_items"]) == 1
    sku_item = data["picklist_items"][0]
    assert sku_item["sku"] == "BLU_KURTI_XL"
    assert sku_item["total_quantity"] == 2
    assert sku_item["label_count"] == 1
    assert "Delhivery" in sku_item["courier_partners"]

    # Verify artifact download endpoints
    job_id = data["job_id"]
    pdf_res = client.get(f"/api/v1/labels/jobs/{job_id}/download/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"

    # Verify output PDF contains tightly-cropped label without invoice
    out_doc = fitz.open(stream=pdf_res.content, filetype="pdf")
    assert len(out_doc) == 1
    p = out_doc[0]
    assert p.rect.width >= 100.0
    assert p.rect.height >= 80.0
    assert p.rect.height < 600.0  # Large blank / invoice lower region removed

    # CRITICAL VERIFICATION: Invoice table data MUST NOT be in the output thermal page
    output_text = p.get_text("text")
    assert "GSTIN" not in output_text
    assert "Taxable Value" not in output_text
    # Shipping label details MUST be preserved
    assert "Priya Sharma" in output_text
    assert "BLU_KURTI_XL" in output_text
    out_doc.close()

    # Verify picklist CSV download
    csv_res = client.get(f"/api/v1/labels/jobs/{job_id}/download/picklist")
    assert csv_res.status_code == 200
    assert "BLU_KURTI_XL" in csv_res.text
    assert "Delhivery" in csv_res.text


def test_process_multiple_couriers_and_sorting():
    """Verify multi-label batch with Shadowfax, Delhivery, and Ekart sorted deterministically."""
    pages = [
        # Label 1: Shadowfax
        {
            "top_text": "SHADOWFAX EXPRESS\nAWB: SF90128\nShip To: Rahul V\nSKU: RED_SHIRT_M\nQty: 1\nOrder ID: 101",
            "bottom_text": "TAX INVOICE\nGSTIN: 07AA\nTotal Amount: 500",
        },
        # Label 2: Delhivery
        {
            "top_text": "DELHIVERY\nAWB: DL8829\nShip To: Amit K\nSKU: BLACK_SHOES_9\nQty: 1\nOrder ID: 102",
            "bottom_text": "TAX INVOICE\nGSTIN: 07AA\nTotal Amount: 1200",
        },
        # Label 3: Ekart
        {
            "top_text": "EKART LOGISTICS\nAWB: EK7732\nShip To: Sneha P\nSKU: RED_SHIRT_M\nQty: 2\nOrder ID: 103",
            "bottom_text": "TAX INVOICE\nGSTIN: 07AA\nTotal Amount: 999",
        },
    ]

    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("multi_courier.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={
            "output_format": "4x6_thermal",
            "sort_by": "courier_partner",
            "remove_invoice": "true",
            "enable_sku_picklist": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["total_labels_generated"] == 3
    courier_names = [c["courier"] for c in data["courier_breakdown"]]
    assert "Delhivery" in courier_names
    assert "Ekart" in courier_names
    assert "Shadowfax" in courier_names

    # Check consolidated picklist distinguishes product quantity from label count
    # RED_SHIRT_M appeared on 2 labels (Shadowfax qty 1 + Ekart qty 2 = 3 units)
    red_shirt = next(item for item in data["picklist_items"] if item["sku"] == "RED_SHIRT_M")
    assert red_shirt["total_quantity"] == 3
    assert red_shirt["label_count"] == 2
    assert "Ekart" in red_shirt["courier_partners"]
    assert "Shadowfax" in red_shirt["courier_partners"]


def test_process_invoice_removal_safety_and_ambiguity():
    """Verify safety rule: if shipping address appears in lower half, invoice removal is safely aborted."""
    # A flawed page where "Ship To" is at the bottom, so cropping the top would destroy the address
    flawed_page = {
        "top_text": "TAX INVOICE\nGSTIN: 29AABB\nInvoice No: 123",
        "bottom_text": "Deliver To: John Doe\nAWB: 9999\nSKU: TEST_SKU\nDelhivery",
    }

    pdf_bytes = create_mock_meesho_pdf([flawed_page])
    files = [("files", ("unsafe_invoice.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={
            "output_format": "4x6_thermal",
            "sort_by": "courier_partner",
            "remove_invoice": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Never silently dropped: label is preserved and page is flagged
    assert data["total_labels_generated"] == 1
    assert data["total_pages_flagged"] >= 1
    assert len(data["warnings"]) >= 1


def test_process_unmatched_sku_preservation():
    """Verify labels without SKU text are marked UNMATCHED and never invented or dropped."""
    page_without_sku = {
        "top_text": "VALMO LOGISTICS\nAWB: VL44321\nShip To: Ritu Sen\nKolkata, WB - 700001",
        "bottom_text": "TAX INVOICE\nGSTIN: 19AA\nTotal Amount: 450",
    }

    pdf_bytes = create_mock_meesho_pdf([page_without_sku])
    files = [("files", ("no_sku.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={"enable_sku_picklist": "true"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total_labels_generated"] == 1

    # Check picklist includes UNMATCHED entry
    unmatched_item = next(
        (item for item in data["picklist_items"] if item["status"] == "UNMATCHED"),
        None,
    )
    assert unmatched_item is not None
    assert unmatched_item["label_count"] == 1
    assert "Valmo" in unmatched_item["courier_partners"]


def test_process_original_order_sorting():
    """Verify labels preserve exact original input sequence when sort_by=original_order."""
    pages = [
        {"top_text": "VALMO\nShip To: User 1\nSKU: SKU_C\nQty: 1", "bottom_text": "TAX INVOICE\nTotal: 100"},
        {"top_text": "DELHIVERY\nShip To: User 2\nSKU: SKU_A\nQty: 1", "bottom_text": "TAX INVOICE\nTotal: 200"},
        {"top_text": "SHADOWFAX\nShip To: User 3\nSKU: SKU_B\nQty: 1", "bottom_text": "TAX INVOICE\nTotal: 300"},
    ]
    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("original_batch.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={"sort_by": "original_order"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_labels_generated"] == 3
    # Check page output mapping preserves input sequence: Valmo, Delhivery, Shadowfax
    assert data["pages"][0]["courier_partner"] == "Valmo"
    assert data["pages"][0]["output_page_index"] == 1
    assert data["pages"][1]["courier_partner"] == "Delhivery"
    assert data["pages"][1]["output_page_index"] == 2
    assert data["pages"][2]["courier_partner"] == "Shadowfax"
    assert data["pages"][2]["output_page_index"] == 3


def test_process_sku_sorting_and_combined_sku_courier():
    """Verify SKU grouping and combined SKU + Delivery partner grouping."""
    pages = [
        # Label 1: SKU Z, Shadowfax
        {"top_text": "SHADOWFAX\nShip To: User 1\nSKU: ZEBRA_PANTS\nQty: 1", "bottom_text": "TAX INVOICE"},
        # Label 2: SKU B, Shadowfax
        {"top_text": "SHADOWFAX\nShip To: User 2\nSKU: BROWNPO10\nQty: 1", "bottom_text": "TAX INVOICE"},
        # Label 3: SKU B, Delhivery
        {"top_text": "DELHIVERY\nShip To: User 3\nSKU: BROWNPO10\nQty: 1", "bottom_text": "TAX INVOICE"},
    ]
    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("sku_batch.pdf", pdf_bytes, "application/pdf"))]

    # Test SKU + Courier sorting
    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={"sort_by": "sku_courier"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_labels_generated"] == 3
    # BROWNPO10 Delhivery should be output page 1, BROWNPO10 Shadowfax output page 2, ZEBRA_PANTS output page 3
    # Let's inspect output_page_index on pages
    p1 = next(p for p in data["pages"] if p["sku_items"] and p["sku_items"][0]["sku"] == "BROWNPO10" and p["courier_partner"] == "Delhivery")
    p2 = next(p for p in data["pages"] if p["sku_items"] and p["sku_items"][0]["sku"] == "BROWNPO10" and p["courier_partner"] == "Shadowfax")
    p3 = next(p for p in data["pages"] if p["sku_items"] and p["sku_items"][0]["sku"] == "ZEBRA_PANTS")

    assert p1["output_page_index"] < p2["output_page_index"]
    assert p2["output_page_index"] < p3["output_page_index"]

    # Picklist was automatically generated because sort_by is sku_courier
    assert data["downloads"]["picklist_csv"] is not None
    assert len(data["picklist_items"]) == 2


def test_process_picklist_optionality_and_previews():
    """Verify picklist is only compiled when requested or SKU-sorted, and preview endpoints work."""
    pages = [
        {"top_text": "DELHIVERY\nShip To: User 1\nSKU: TEST_ITEM\nQty: 1", "bottom_text": "TAX INVOICE"},
    ]
    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("optional_picklist.pdf", pdf_bytes, "application/pdf"))]

    # Case A: original_order without picklist enabled
    res_no_pick = client.post(
        "/api/v1/labels/process",
        files=files,
        data={"sort_by": "original_order", "enable_sku_picklist": "false"},
    )
    assert res_no_pick.status_code == 200
    d_no_pick = res_no_pick.json()
    assert d_no_pick["downloads"]["picklist_csv"] is None
    assert len(d_no_pick["picklist_items"]) == 0

    job_id = d_no_pick["job_id"]
    # Check picklist download 404s when not generated
    pick_res = client.get(f"/api/v1/labels/jobs/{job_id}/download/picklist")
    assert pick_res.status_code == 404

    # Check page preview PNG endpoint
    preview_res = client.get(f"/api/v1/labels/jobs/{job_id}/preview/page/1")
    assert preview_res.status_code == 200
    assert preview_res.headers["content-type"] == "image/png"
    assert len(preview_res.content) > 100

    # Check inline PDF view endpoint
    view_res = client.get(f"/api/v1/labels/jobs/{job_id}/view/pdf")
    assert view_res.status_code == 200
    assert view_res.headers["content-type"] == "application/pdf"
    assert "inline" in view_res.headers["content-disposition"]


def test_process_top_label_with_large_blank_lower_area_no_invoice():
    """Verify that a page with a label at the top and a large blank lower area (no invoice) has blank area cropped."""
    # A4 page (595 x 842 pt). The label is only in the top 300 pt. y=300..842 is completely blank.
    blank_lower_page = {
        "width": 595.0,
        "height": 842.0,
        "top_text": (
            "VALMO LOGISTICS\n"
            "AWB: VL991827361\n"
            "Ship To: Adarsha Nayak\n"
            "Green basl days school, Odisha - 752103\n"
            "Product Details\n"
            "SKU: mpk10brown100\n"
            "Qty: 1\n"
            "Order No: 342079102375210800_1"
        ),
        # NO bottom_text -> large blank area below
    }

    pdf_bytes = create_mock_meesho_pdf([blank_lower_page])
    files = [("files", ("valmo_blank_lower.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={"output_format": "4x6_thermal", "remove_invoice": "true"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_labels_generated"] == 1
    assert data["total_invoices_removed"] == 0  # No invoice was present

    job_id = data["job_id"]
    pdf_res = client.get(f"/api/v1/labels/jobs/{job_id}/download/pdf")
    assert pdf_res.status_code == 200

    out_doc = fitz.open(stream=pdf_res.content, filetype="pdf")
    assert len(out_doc) == 1
    p = out_doc[0]
    assert p.rect.width >= 100.0
    assert p.rect.height >= 80.0
    assert p.rect.height < 600.0  # Blank lower region removed

    out_text = p.get_text("text")
    assert "Adarsha Nayak" in out_text
    assert "mpk10brown100" in out_text
    assert "Valmo" in data["courier_breakdown"][0]["courier"]
    out_doc.close()


def test_process_three_page_meesho_batch_realistic():
    """Verify realistic 3-page Meesho batch with Delhivery, Shadowfax, and Ekart split layouts."""
    pages = [
        # Page 1: Delhivery
        {
            "width": 595.0,
            "height": 842.0,
            "top_text": "DELHIVERY SURFACE\nAWB: 14092837192847\nShip To: Priya Sharma\nSKU: KURTI-EMB-BLUE-XL\nQty: 2\nOrder No: MSH-ORD-90182\n--- CUT HERE FOR THERMAL ROLL ---",
            "bottom_text": "TAX INVOICE\nGSTIN: 24AABCU9603R1ZM\nInvoice No: INV-2026-9041\nTotal Amount: Rs. 1,060.82",
        },
        # Page 2: Shadowfax
        {
            "width": 595.0,
            "height": 842.0,
            "top_text": "SHADOWFAX EXPRESS\nAWB: SFX991029381\nShip To: Vikram Singh\nSKU: SAREE-COTTON-RED\nQty: 1\nOrder No: MSH-ORD-90183\n--- CUT HERE FOR THERMAL ROLL ---",
            "bottom_text": "TAX INVOICE\nGSTIN: 24AABCU9603R1ZM\nInvoice No: INV-2026-9042\nTotal Amount: Rs. 650.00",
        },
        # Page 3: Ekart
        {
            "width": 595.0,
            "height": 842.0,
            "top_text": "EKART LOGISTICS\nAWB: EK7732109283\nShip To: Anita Desai\nSKU: KURTI-EMB-BLUE-XL\nQty: 1\nOrder No: MSH-ORD-90184\n--- CUT HERE FOR THERMAL ROLL ---",
            "bottom_text": "TAX INVOICE\nGSTIN: 24AABCU9603R1ZM\nInvoice No: INV-2026-9043\nTotal Amount: Rs. 899.00",
        },
    ]

    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("sample_meesho_batch.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={
            "output_format": "4x6_thermal",
            "sort_by": "original_order",
            "remove_invoice": "true",
            "enable_sku_picklist": "true",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_labels_generated"] == 3
    assert data["total_invoices_removed"] == 3
    assert data["total_pages_flagged"] == 0

    job_id = data["job_id"]
    pdf_res = client.get(f"/api/v1/labels/jobs/{job_id}/download/pdf")
    out_doc = fitz.open(stream=pdf_res.content, filetype="pdf")
    assert len(out_doc) == 3

    # Check each output page contains only the cropped shipping label without tax invoice
    for i, p in enumerate(out_doc):
        assert p.rect.width >= 100.0
        assert p.rect.height >= 80.0
        assert p.rect.height < 600.0
        txt = p.get_text("text")
        # Invoices must be completely absent from all 3 thermal pages
        assert "GSTIN" not in txt
        assert "Invoice No" not in txt

    # Page 1 has Priya Sharma, Page 2 has Vikram Singh, Page 3 has Anita Desai
    assert "Priya Sharma" in out_doc[0].get_text("text")
    assert "Vikram Singh" in out_doc[1].get_text("text")
    assert "Anita Desai" in out_doc[2].get_text("text")
    out_doc.close()


def test_inspect_uploaded_labels_pre_crop():
    """Verify pre-crop upload inspection instantly groups Main SKUs (e.g. GREEN, BROWN) and couriers."""
    pages = [
        # Valmo with Brown SKU
        {
            "top_text": (
                "VALMO PICKUP\n"
                "Customer Address: User 1\n"
                "Product Details\n"
                "SKU Size Qty Color Order No.\n"
                "rspk10brown160 Free Size 1 NA 342619162375210880_1\n"
            ),
            "bottom_text": "TAX INVOICE\nBILL TO / SHIP TO\nAdarsha",
        },
        # Shadowfax with Green SKU
        {
            "top_text": (
                "SHADOWFAX PICKUP\n"
                "Customer Address: User 2\n"
                "Product Details\n"
                "SKU Size Qty Color Order No.\n"
                "Po10Green344 Free Size 2 NA 343305139935340480_1\n"
            ),
            "bottom_text": "TAX INVOICE\nBILL TO / SHIP TO\nVishal",
        },
    ]

    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("pre_crop_batch.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/inspect-upload",
        files=files,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_files"] == 1
    assert data["total_pages"] == 2
    assert data["total_labels"] == 2

    # Check Couriers: Valmo and Shadowfax
    couriers = {c["courier"]: c["label_count"] for c in data["courier_breakdown"]}
    assert couriers.get("Valmo") == 1
    assert couriers.get("Shadowfax") == 1

    # Check Main SKUs: BROWN and GREEN
    main_sku_names = [m["main_sku"] for m in data["main_skus"]]
    assert "BROWN" in main_sku_names
    assert "GREEN" in main_sku_names

    # Check sub SKUs inside main SKUs
    brown_group = next(m for m in data["main_skus"] if m["main_sku"] == "BROWN")
    assert brown_group["total_quantity"] >= 1
    assert brown_group["courier_counts"]["Valmo"] == 1

    green_group = next(m for m in data["main_skus"] if m["main_sku"] == "GREEN")
    assert green_group["total_quantity"] >= 2
    assert green_group["courier_counts"]["Shadowfax"] == 1


def test_sort_by_sku_and_courier_hierarchy():
    """Verify that SKU + Delivery Partner groups by Main SKU first (e.g. BROWN, then GREEN),
    and within each Main SKU groups by Delivery Partner (e.g. Valmo, then Shadowfax)."""
    pages = [
        # 1. Green with Shadowfax
        {
            "top_text": (
                "SHADOWFAX PICKUP\n"
                "Customer Address: Vishal\n"
                "Product Details\n"
                "SKU Size Qty Color Order No.\n"
                "Po10Green344 Free Size 1 NA 111111111111111111_1\n"
            ),
        },
        # 2. Brown with Shadowfax
        {
            "top_text": (
                "SHADOWFAX PICKUP\n"
                "Customer Address: Priya\n"
                "Product Details\n"
                "SKU Size Qty Color Order No.\n"
                "rspk10brown160 Free Size 1 NA 222222222222222222_1\n"
            ),
        },
        # 3. Green with Valmo
        {
            "top_text": (
                "VALMO PICKUP\n"
                "Customer Address: Rahul\n"
                "Product Details\n"
                "SKU Size Qty Color Order No.\n"
                "Po10Green320 Free Size 1 NA 333333333333333333_1\n"
            ),
        },
        # 4. Brown with Valmo
        {
            "top_text": (
                "VALMO PICKUP\n"
                "Customer Address: Amit\n"
                "Product Details\n"
                "SKU Size Qty Color Order No.\n"
                "rspk10brown200 Free Size 1 NA 444444444444444444_1\n"
            ),
        },
    ]

    pdf_bytes = create_mock_meesho_pdf(pages)
    files = [("files", ("mixed_batch.pdf", pdf_bytes, "application/pdf"))]

    response = client.post(
        "/api/v1/labels/process",
        files=files,
        data={
            "output_format": "4x6_thermal",
            "sort_by": "sku_courier",
            "remove_invoice": "false",
            "enable_sku_picklist": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total_labels_generated"] == 4

    # Output order should be:
    # 1 & 2: BROWN labels (Shadowfax, then Valmo)
    # 3 & 4: GREEN labels (Shadowfax, then Valmo)
    pages_out = sorted(data["pages"], key=lambda p: p["output_page_index"])
    
    # First 2 pages must be BROWN
    p1_sku = pages_out[0]["sku_items"][0]["sku"].upper()
    p2_sku = pages_out[1]["sku_items"][0]["sku"].upper()
    assert "BROWN" in p1_sku
    assert "BROWN" in p2_sku

    # Next 2 pages must be GREEN
    p3_sku = pages_out[2]["sku_items"][0]["sku"].upper()
    p4_sku = pages_out[3]["sku_items"][0]["sku"].upper()
    assert "GREEN" in p3_sku
    assert "GREEN" in p4_sku

    # Main SKUs included in response
    assert any(m["main_sku"] == "BROWN" for m in data.get("main_skus", []))
    assert any(m["main_sku"] == "GREEN" for m in data.get("main_skus", []))
