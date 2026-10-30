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
  database_connected?: boolean;
  capabilities: {
    pdf_validation: boolean;
    cropping_engine: string;
    courier_sorting: string;
    invoice_filter: string;
    sku_picklist: string;
    database_connected?: boolean;
    sku_intelligence?: string;
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
  | "sku_courier"
  | "marketplace"
  | "marketplace_sku_courier"
  | "marketplace_courier"
  | "sku_marketplace_courier"
  | "courier_sku_marketplace"
  | "courier_marketplace_sku"
  | "sku_courier_marketplace";

export interface ProcessingConfig {
  output_format: string; // "4x6_thermal" | "a4_grid"
  sort_by: SortOption;
  remove_invoice: boolean;
  enable_sku_picklist: boolean;
  smart_sku_detection?: boolean;
  excluded_main_skus?: string[];
  excluded_skus?: string[];
  excluded_couriers?: string[];
  excluded_order_ids?: string[];
  excluded_marketplaces?: string[];
}

export interface ExtractedSKU {
  sku: string;
  quantity: number;
  description?: string;
  order_id?: string;
  match_type?: string;
  confidence?: number;
}

export interface CourierSummary {
  courier: string;
  label_count: number;
  percentage: number;
}

export interface MarketplaceSummary {
  marketplace: string;
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
  marketplace?: string;
  output_page_index?: number;
  dimensions_pt: number[];
}

export interface DownloadLinks {
  thermal_pdf: string;
  picklist_csv?: string;
  report_json: string;
  google_drive_folder?: string;
  google_drive_pdf?: string;
  google_drive_picklist?: string;
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
  marketplace_breakdown?: MarketplaceSummary[];
  main_skus: MainSkuSummary[];
  all_skus: SubSkuSummary[];
}

export interface AmbiguousLabelItem {
  label_index: number;
  filename: string;
  page_number: number;
  raw_text_snippet: string;
  original_sku?: string;
  detected_candidates: string[];
  chosen_sku?: string;
  matching_keyword?: string;
}

export interface DuplicateLabelItem {
  order_id: string;
  wbl_id?: string;
  sku: string;
  courier: string;
  input_filename: string;
  page_number: number;
  previous_job_id?: string;
  previous_filename?: string;
  previous_processed_at?: string;
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
  marketplace_breakdown?: MarketplaceSummary[];
  main_skus?: MainSkuSummary[];
  all_skus?: SubSkuSummary[];
  picklist_items: PicklistItem[];
  pages: PageProcessingRecord[];
  warnings: string[];
  has_ambiguity?: boolean;
  ambiguous_labels?: AmbiguousLabelItem[];
  has_duplicates?: boolean;
  all_labels_duplicate?: boolean;
  duplicate_labels?: DuplicateLabelItem[];
  excluded_duplicates_count?: number;
  formatted_filename?: string;
  marketplace?: string;
  downloads: DownloadLinks;
}

/* ========================================================
   USER AUTHENTICATION & PERSONAL SKU DATABASE SCHEMAS
   ======================================================== */

export interface UserSettings {
  default_sort_mode: string;
  default_invoice_removal: boolean;
  default_picklist: boolean;
  sku_matching_sensitivity: string;
  auto_save_to_drive?: boolean;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  is_active: boolean;
  settings: UserSettings;
  created_at: string;
  last_login_at?: string;
  google_id?: string;
  google_picture?: string;
  google_drive_connected?: boolean;
  google_drive_folder_url?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  user: User;
}

export interface UserSKU {
  id: string;
  user_id: string;
  sku_code: string;
  product_name: string;
  keywords: string[];
  aliases: string[];
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SKUListResponse {
  items: UserSKU[];
  total: number;
  page: number;
  size: number;
}

export interface SKUImportResult {
  imported_count: number;
  updated_count: number;
  total_processed: number;
  errors: string[];
}

export interface SaveDecisionRequest {
  raw_product_text: string;
  chosen_sku: string;
  matching_keyword?: string;
  remember_rule: boolean;
  job_id?: string;
}

export interface Decision {
  id: string;
  user_id: string;
  raw_product_text: string;
  normalized_product_text: string;
  chosen_sku: string;
  created_at: string;
}

export interface JobHistoryItem {
  id: string;
  job_id: string;
  status: string;
  created_at: string;
  total_files: number;
  total_labels_generated: number;
  courier_breakdown: CourierSummary[];
  main_skus: MainSkuSummary[];
  downloads: DownloadLinks;
  google_drive?: {
    saved?: boolean;
    folder_url?: string;
    pdf_drive_url?: string;
    picklist_drive_url?: string;
    synced_at?: string;
  };
  has_ambiguity: boolean;
  formatted_filename?: string;
  marketplace?: string;
  is_trashed?: boolean;
  trashed_at?: string;
}

export interface JobHistoryResponse {
  items: JobHistoryItem[];
  total: number;
  page: number;
  size: number;
  active_count?: number;
  trash_count?: number;
}

export interface GoogleDriveStatus {
  connected: boolean;
  email?: string;
  folder_name?: string;
  folder_url?: string;
  auto_save?: boolean;
}

export interface SaveToDriveResponse {
  success: boolean;
  job_id: string;
  folder_url?: string;
  pdf_drive_url?: string;
  picklist_drive_url?: string;
  message: string;
}

export interface LabelAppearance {
  job_id: string;
  pdf_filename: string;
  input_filename?: string;
  page_number: number;
  created_at: string;
}

export interface MasterLabelItem {
  id: string;
  user_id: string;
  order_id: string;
  sku: string;
  matched_sku?: string | null;
  wbl_id?: string | null;
  courier_partner: string;
  marketplace: string;
  appearances: LabelAppearance[];
  first_processed_at: string;
  last_processed_at: string;
}

export interface MasterSheetResponse {
  items: MasterLabelItem[];
  total: number;
  page: number;
  size: number;
  unique_orders_count: number;
  unique_skus_count: number;
  all_time_total?: number;
  filtered_total?: number;
  marketplace_counts?: Record<string, number>;
  couriers_list: string[];
}
