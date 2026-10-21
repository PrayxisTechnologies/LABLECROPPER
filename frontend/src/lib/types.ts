/**
 * LabelFlow Frontend Type Definitions
 */

export interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  formattedSize: string;
  status: "ready" | "validating" | "valid" | "error";
  errorMessage?: string;
  pageCount?: number;
}

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  capabilities: {
    pdf_validation: boolean;
    cropping_engine: string;
    courier_sorting: string;
    invoice_filter: string;
    sku_picklist: string;
  };
}

export interface BackendFileValidationItem {
  filename: string;
  size_bytes: number;
  is_valid: boolean;
  mime_type?: string;
  page_count?: number;
  errors: string[];
  warnings: string[];
}

export interface BackendValidationResponse {
  success: boolean;
  total_files: number;
  valid_files_count: number;
  invalid_files_count: number;
  all_valid: boolean;
  files: BackendFileValidationItem[];
  phase_notice: string;
}

export type SortOption =
  | "original_order"
  | "sku"
  | "courier_partner"
  | "sku_courier";

export interface ProcessingConfig {
  output_format: string; // "4x6_thermal" | "a4_grid"
  sort_by: SortOption;
  remove_invoice: boolean;
  enable_sku_picklist: boolean;
}

export interface ExtractedSKU {
  sku: string;
  quantity: number;
  description?: string;
  order_id?: string;
}

export interface CourierSummary {
  courier: string;
  label_count: number;
  percentage: number;
}

export interface PicklistItem {
  sku: string;
  total_quantity: number;
  label_count: number;
  courier_partners: string[];
  status: string;
  order_references: string[];
}

export interface PageProcessingRecord {
  input_filename: string;
  page_number: number;
  page_type: string;
  is_label_extracted: boolean;
  is_invoice_removed: boolean;
  is_flagged_for_review: boolean;
  review_reason?: string;
  courier_partner: string;
  courier_confidence: number;
  sku_items: ExtractedSKU[];
  output_page_index?: number;
  dimensions_pt: number[];
}

export interface DownloadLinks {
  thermal_pdf: string;
  picklist_csv?: string;
  report_json: string;
}

export interface SubSkuSummary {
  sku: string;
  main_sku: string;
  quantity: number;
  label_count: number;
  courier_partners: string[];
}

export interface MainSkuSummary {
  main_sku: string;
  total_quantity: number;
  label_count: number;
  courier_counts?: Record<string, number>;
  sub_skus: SubSkuSummary[];
}

export interface UploadInspectionResponse {
  total_files: number;
  total_pages: number;
  total_labels: number;
  courier_breakdown: CourierSummary[];
  main_skus: MainSkuSummary[];
  all_skus: SubSkuSummary[];
}

export interface ProcessingJobResponse {
  job_id: string;
  status: "completed" | "partial" | "failed";
  created_at: string;
  config: ProcessingConfig;
  total_files: number;
  total_input_pages: number;
  total_labels_generated: number;
  total_invoices_removed: number;
  total_pages_flagged: number;
  courier_breakdown: CourierSummary[];
  main_skus?: MainSkuSummary[];
  all_skus?: SubSkuSummary[];
  picklist_items: PicklistItem[];
  pages: PageProcessingRecord[];
  warnings: string[];
  downloads: DownloadLinks;
}
