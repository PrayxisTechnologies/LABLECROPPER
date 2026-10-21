"""Standalone generator for sample Meesho shipping labels for test runs."""

import os
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


def generate_meesho_sample_batch(output_path: str = "samples/sample_meesho_batch.pdf") -> str:
    """Generate a realistic 3-page Meesho shipping batch PDF."""
    if fitz is None:
        print("PyMuPDF is required to generate sample PDF. Run: pip install pymupdf")
        return ""

    doc = fitz.open()

    # Page 1: Delhivery Split Page (Top: Label, Bottom: Tax Invoice)
    p1 = doc.new_page(width=595.0, height=842.0)
    # Header & Logistics
    p1.insert_text(fitz.Point(40, 50), "DELHIVERY SURFACE", fontsize=16, fontname="helv")
    p1.insert_text(fitz.Point(40, 75), "AWB: 14092837192847", fontsize=11, fontname="helv")
    p1.insert_text(fitz.Point(400, 50), "STANDARD", fontsize=12, fontname="helv")
    # Barcode placeholder box
    p1.draw_rect(fitz.Rect(40, 85, 340, 135), color=(0, 0, 0), width=1.5)
    p1.insert_text(fitz.Point(90, 115), "|||||||| |||||| |||||||||| |||| ||||||||", fontsize=14, fontname="helv")
    # Ship To Address
    p1.insert_text(fitz.Point(40, 160), "Ship To:", fontsize=11, fontname="helv")
    p1.insert_text(fitz.Point(40, 178), "Priya Sharma", fontsize=12, fontname="helv")
    p1.insert_text(fitz.Point(40, 196), "Flat 402, Green Valley Apartments, Near City Center", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(40, 212), "Andheri West, Mumbai, Maharashtra", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(40, 228), "PIN Code: 400053", fontsize=11, fontname="helv")
    # Return To Address
    p1.insert_text(fitz.Point(340, 160), "Return To:", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(340, 176), "Radha Fashion Hub (Meesho Seller)", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(340, 192), "Surat Textile Market, Surat, Gujarat - 395002", fontsize=9, fontname="helv")
    # SKU line item box
    p1.draw_rect(fitz.Rect(40, 260, 555, 330), color=(0.3, 0.3, 0.3), width=1)
    p1.insert_text(fitz.Point(50, 285), "SKU: KURTI-EMB-BLUE-XL", fontsize=11, fontname="helv")
    p1.insert_text(fitz.Point(300, 285), "Qty: 2", fontsize=11, fontname="helv")
    p1.insert_text(fitz.Point(420, 285), "Size: XL", fontsize=11, fontname="helv")
    p1.insert_text(fitz.Point(50, 310), "Order No: MSH-ORD-90182", fontsize=10, fontname="helv")
    # Divider line separating Label from Invoice
    p1.draw_line(fitz.Point(20, 420), fitz.Point(575, 420), color=(0.6, 0.6, 0.6), width=1)
    p1.insert_text(fitz.Point(230, 415), "--- CUT HERE FOR THERMAL ROLL ---", fontsize=8, fontname="helv")
    # Tax Invoice Bottom Half
    p1.insert_text(fitz.Point(240, 460), "TAX INVOICE", fontsize=14, fontname="helv")
    p1.insert_text(fitz.Point(210, 480), "Original for Recipient", fontsize=9, fontname="helv")
    p1.insert_text(fitz.Point(40, 510), "GSTIN: 24AABCU9603R1ZM", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(40, 530), "Invoice No: INV-2026-9041", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(40, 550), "Invoice Date: 20-10-2026", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(40, 590), "HSN: 6204", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(140, 590), "Taxable Value: Rs. 899.00", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(340, 590), "IGST (18%): Rs. 161.82", fontsize=10, fontname="helv")
    p1.insert_text(fitz.Point(40, 630), "Total Amount: Rs. 1,060.82", fontsize=12, fontname="helv")

    # Page 2: Shadowfax Split Page
    p2 = doc.new_page(width=595.0, height=842.0)
    p2.insert_text(fitz.Point(40, 50), "SHADOWFAX EXPRESS", fontsize=16, fontname="helv")
    p2.insert_text(fitz.Point(40, 75), "AWB: SFX991029381", fontsize=11, fontname="helv")
    p2.draw_rect(fitz.Rect(40, 85, 340, 135), color=(0, 0, 0), width=1.5)
    p2.insert_text(fitz.Point(90, 115), "|||||||| |||||| |||||||||| |||| ||||||||", fontsize=14, fontname="helv")
    p2.insert_text(fitz.Point(40, 160), "Ship To:", fontsize=11, fontname="helv")
    p2.insert_text(fitz.Point(40, 178), "Vikram Singh", fontsize=12, fontname="helv")
    p2.insert_text(fitz.Point(40, 196), "House No. 12, Sector 15, Huda Complex", fontsize=10, fontname="helv")
    p2.insert_text(fitz.Point(40, 212), "Gurugram, Haryana - 122001", fontsize=10, fontname="helv")
    p2.insert_text(fitz.Point(340, 160), "Return To:", fontsize=10, fontname="helv")
    p2.insert_text(fitz.Point(340, 176), "Radha Fashion Hub", fontsize=10, fontname="helv")
    p2.draw_rect(fitz.Rect(40, 260, 555, 330), color=(0.3, 0.3, 0.3), width=1)
    p2.insert_text(fitz.Point(50, 285), "SKU: SAREE-COTTON-RED", fontsize=11, fontname="helv")
    p2.insert_text(fitz.Point(300, 285), "Qty: 1", fontsize=11, fontname="helv")
    p2.insert_text(fitz.Point(50, 310), "Order No: MSH-ORD-90183", fontsize=10, fontname="helv")
    p2.draw_line(fitz.Point(20, 420), fitz.Point(575, 420), color=(0.6, 0.6, 0.6), width=1)
    p2.insert_text(fitz.Point(240, 460), "TAX INVOICE", fontsize=14, fontname="helv")
    p2.insert_text(fitz.Point(40, 510), "GSTIN: 24AABCU9603R1ZM", fontsize=10, fontname="helv")
    p2.insert_text(fitz.Point(40, 530), "Invoice No: INV-2026-9042", fontsize=10, fontname="helv")
    p2.insert_text(fitz.Point(40, 570), "Total Amount: Rs. 650.00", fontsize=12, fontname="helv")

    # Page 3: Ekart Split Page
    p3 = doc.new_page(width=595.0, height=842.0)
    p3.insert_text(fitz.Point(40, 50), "EKART LOGISTICS", fontsize=16, fontname="helv")
    p3.insert_text(fitz.Point(40, 75), "AWB: EK7732109283", fontsize=11, fontname="helv")
    p3.draw_rect(fitz.Rect(40, 85, 340, 135), color=(0, 0, 0), width=1.5)
    p3.insert_text(fitz.Point(90, 115), "|||||||| |||||| |||||||||| |||| ||||||||", fontsize=14, fontname="helv")
    p3.insert_text(fitz.Point(40, 160), "Ship To:", fontsize=11, fontname="helv")
    p3.insert_text(fitz.Point(40, 178), "Anita Desai", fontsize=12, fontname="helv")
    p3.insert_text(fitz.Point(40, 196), "C-14, Ashok Nagar, Near Metro Station", fontsize=10, fontname="helv")
    p3.insert_text(fitz.Point(40, 212), "Bengaluru, Karnataka - 560025", fontsize=10, fontname="helv")
    p3.draw_rect(fitz.Rect(40, 260, 555, 330), color=(0.3, 0.3, 0.3), width=1)
    p3.insert_text(fitz.Point(50, 285), "SKU: KURTI-EMB-BLUE-XL", fontsize=11, fontname="helv")
    p3.insert_text(fitz.Point(300, 285), "Qty: 1", fontsize=11, fontname="helv")
    p3.insert_text(fitz.Point(50, 310), "Order No: MSH-ORD-90184", fontsize=10, fontname="helv")
    p3.draw_line(fitz.Point(20, 420), fitz.Point(575, 420), color=(0.6, 0.6, 0.6), width=1)
    p3.insert_text(fitz.Point(240, 460), "TAX INVOICE", fontsize=14, fontname="helv")
    p3.insert_text(fitz.Point(40, 510), "GSTIN: 24AABCU9603R1ZM", fontsize=10, fontname="helv")
    p3.insert_text(fitz.Point(40, 530), "Invoice No: INV-2026-9043", fontsize=10, fontname="helv")
    p3.insert_text(fitz.Point(40, 570), "Total Amount: Rs. 899.00", fontsize=12, fontname="helv")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path, deflate=True)
    doc.close()
    print(f"Sample Meesho PDF created successfully at: {output_path}")
    return output_path


if __name__ == "__main__":
    generate_meesho_sample_batch()
