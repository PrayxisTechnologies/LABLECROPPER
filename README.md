# LabelFlow 🚀

> **High-Performance Meesho Shipping Label Cropping & Sorting Web Application**

LabelFlow is a dedicated fulfillment automation tool designed for Meesho merchants and warehouse operators. It transforms multi-page Meesho batch downloads containing mixed shipping labels and customer invoices into optimized, sorted **4 × 6 inch thermal printer labels** (288 × 432 pt) and consolidated warehouse SKU picklists.

---

## 📌 Phase 2 Completed Features

- **PyMuPDF Vector-Preserving Cropper**: Crops shipping labels to exact 4 × 6 inch thermal roll dimensions (288 × 432 pt) using `show_pdf_page(keep_proportion=True)` with zero distortion and full vector font/barcode fidelity.
- **Rule-Based Layout & Invoice Separation**:
  - Automatically isolates upper shipping labels from lower tax invoices on standard Meesho A4 split sheets.
  - Automatically filters standalone invoice pages when `remove_invoice` is enabled.
  - **Preservation Safety Safeguard**: If invoice and shipping label boundaries are ambiguous or if delivery address data extends into the invoice area, the page is preserved in full and flagged for manual review. No page is ever silently dropped.
- **Deterministic Courier Sorting**: Automatically identifies logistics partners (Delhivery, Shadowfax, Xpressbees, Ekart, Valmo, Ecom Express, Blue Dart, DTDC, Amazon Shipping) and sorts labels into categorized carrier groups before generating the print stream.
- **Warehouse SKU Picklist**: Extracts item SKUs, sizes, and quantities from label line items and generates a consolidated `sku_picklist.csv` distinguishing item quantities from parcel counts. Unmatched parcels are retained as `UNMATCHED`.
- **Artifact Download API**: Direct endpoints for downloading the combined 4 × 6 inch thermal PDF, SKU picklist CSV, and comprehensive JSON audit report.
- **Next.js Dashboard Integration**: Interactive SaaS dashboard with live health monitoring, batch configuration presets, multi-file drag-and-drop, and real-time processing results dialog.

---

## 📂 Project Directory Structure

```text
LabelFlow/
├── frontend/                             # Next.js 14 App Router, TypeScript, Tailwind CSS
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                # Dark theme shell, metadata, and fonts
│   │   │   ├── page.tsx                  # Main LabelFlow dashboard interface
│   │   │   └── globals.css               # Tailwind directives & design system
│   │   ├── components/
│   │   │   ├── Header.tsx                # Brand header, Meesho workspace pill, API status
│   │   │   ├── StatusBanner.tsx          # Phase 2 status & backend connectivity warning
│   │   │   ├── DropZone.tsx              # Drag-and-drop PDF ingestion
│   │   │   ├── FileList.tsx              # Staged files, sizes, remove actions
│   │   │   ├── ConfigSummary.tsx         # Interactive processing configuration cards
│   │   │   ├── ActionFooter.tsx          # Start Processing execution bar
│   │   │   └── ProcessingResultModal.tsx # Output download links, courier breakdown, picklist table
│   │   └── lib/
│   │       ├── api.ts                    # Typed client for backend processing & downloads
│   │       ├── utils.ts                  # Byte formatting and client validation
│   │       └── types.ts                  # TypeScript domain models and API response types
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── next.config.mjs
│   ├── .env.example
│   └── .env.local.example
│
├── backend/                              # Python 3.10+ FastAPI backend service
│   ├── app/
│   │   ├── main.py                       # FastAPI application factory, CORS, and root routes
│   │   ├── core/
│   │   │   ├── config.py                 # Pydantic Settings & storage directory configuration
│   │   │   ├── errors.py                 # Custom exceptions & HTTP error formatting
│   │   │   └── logging.py                # Structured application logger
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── router.py             # API v1 route aggregator
│   │   │       └── endpoints/
│   │   │           ├── health.py         # GET /api/v1/health
│   │   │           ├── validation.py     # POST /api/v1/labels/validate
│   │   │           └── process.py        # POST /api/v1/labels/process & download routes
│   │   ├── schemas/
│   │   │   ├── health.py                 # Health check response schemas
│   │   │   ├── validation.py             # File validation request & response schemas
│   │   │   └── processing.py             # ProcessingJobResponse, CourierSummary, PicklistItem
│   │   └── services/
│   │       ├── pdf/
│   │       │   ├── inspector.py          # Geometry, text block, and layout classifier
│   │       │   ├── validator.py          # PDF magic byte & structural validator
│   │       │   ├── cropper.py            # Vector-preserving 4x6 thermal cropper
│   │       │   ├── courier_sorter.py     # Carrier detection & deterministic sorting
│   │       │   ├── invoice_detector.py   # Safe, rule-based invoice separation
│   │       │   └── processor.py          # Central batch processing orchestrator
│   │       └── picklist/
│   │           └── generator.py          # SKU extraction & picklist CSV compiler
│   ├── tests/
│   │   ├── test_health.py                # Pytest health check tests
│   │   ├── test_validation.py            # Pytest upload & validation tests
│   │   └── test_processing.py            # Pytest Phase 2 engine & safety tests
│   ├── requirements.txt                  # Production dependencies (including PyMuPDF)
│   ├── requirements-dev.txt              # Testing and development dependencies
│   ├── pytest.ini                       # Pytest configuration
│   └── .env.example
│
├── samples/                              # Directory for sample Meesho test PDFs
│   ├── README.md                         # Specifications and layout documentation
│   └── generate_sample_labels.py         # Script to synthesize test batches
│
├── .gitignore                            # Excludes venv, node_modules, PDFs, storage, envs
├── .env.example                          # Root safe development environment template
└── README.md                             # Comprehensive documentation & Windows run guide
```

---

## 🛠️ Windows Setup & Run Guide

### Prerequisites
- **Node.js**: v18.17.0+ or v20+ ([Download Node.js](https://nodejs.org/))
- **Python**: v3.10+ or v3.11+ ([Download Python](https://www.python.org/))

---

### Step 1: Backend Setup (Python & FastAPI)

Open a **PowerShell** or **Command Prompt** window in the project root:

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create a clean Python virtual environment
python -m venv venv

# 3. Activate the virtual environment
# On Windows PowerShell:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1

# (If using CMD instead of PowerShell):
# venv\Scripts\activate.bat

# 4. Upgrade pip and install backend dependencies (FastAPI, PyMuPDF, Pydantic, etc.)
python -m pip install --upgrade pip
pip install -r requirements-dev.txt

# 5. Create local environment configuration
copy .env.example .env

# 6. Run the comprehensive test suite
pytest

# 7. Start the FastAPI development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Once running, the backend is accessible at:
- **API Root**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Health Check**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- **Interactive OpenAPI Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

### Step 2: Generate Sample Meesho Batch (Optional)

In your activated Python terminal, generate a realistic 3-page Meesho shipping batch:

```powershell
# From project root
python samples/generate_sample_labels.py
```
This generates `samples/sample_meesho_batch.pdf` (Delhivery, Shadowfax, and Ekart with invoices) ready to drag and drop into the UI!

---

### Step 3: Frontend Setup (Next.js & Tailwind CSS)

Open a **second** terminal window in the project root:

```powershell
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node.js dependencies
npm install

# 3. Create local environment configuration
copy .env.local.example .env.local

# 4. Start the Next.js development server
npm run dev
```

The frontend dashboard will be available at:
- **Web App**: [http://localhost:3000](http://localhost:3000)

---

## 📡 API Reference

### 1. Batch Processing Endpoint
- **Method**: `POST`
- **Route**: `/api/v1/labels/process`
- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `files`: One or more PDF shipping label files.
  - `output_format`: `"4x6_thermal"` (default) or `"a4_grid"`
  - `sort_by`: `"original_order"` (default), `"sku"`, `"courier_partner"`, or `"sku_courier"`
  - `remove_invoice`: `true` (default) or `false`
  - `enable_sku_picklist`: `false` (default; automatically enabled when sorting by SKU or SKU + Courier)
- **Response**: `ProcessingJobResponse` containing `job_id`, counts, courier breakdown, picklist items, and artifact download URLs.

### 2. Artifact Download & Preview Endpoints
- **Thermal PDF Download**: `GET /api/v1/labels/jobs/{job_id}/download/pdf`
- **SKU Picklist CSV**: `GET /api/v1/labels/jobs/{job_id}/download/picklist`
- **Audit Report JSON**: `GET /api/v1/labels/jobs/{job_id}/download/report`
- **Page PNG Preview (1-indexed)**: `GET /api/v1/labels/jobs/{job_id}/preview/page/{page_number}`
- **Inline PDF View**: `GET /api/v1/labels/jobs/{job_id}/view/pdf`
- **Job Status**: `GET /api/v1/labels/jobs/{job_id}/status`
