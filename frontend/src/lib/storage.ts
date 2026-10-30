/**
 * LabelFlow User Settings Local Storage Helper
 * Persists user's customized options (Sort order, invoice filter, picklist)
 * across browser sessions.
 *
 * NOTE: Exclusions (excluded_skus, excluded_main_skus, excluded_couriers)
 * are batch-specific filters and MUST NEVER persist into localStorage across
 * new uploads or browser sessions to prevent silent omission of seller orders.
 */

import { ProcessingConfig } from "./types";

const SETTINGS_KEY = "labelflow_user_preferences_v2";

export const DEFAULT_CONFIG: ProcessingConfig = {
  output_format: "4x6_thermal",
  sort_by: "sku_courier", // Default: SKU + Delivery partner (Main SKU first)
  remove_invoice: true,
  enable_sku_picklist: true,
  smart_sku_detection: false,
  excluded_main_skus: [],
  excluded_skus: [],
  excluded_couriers: [],
  excluded_order_ids: [],
};

/**
 * Load saved configuration from localStorage, or return smart defaults.
 * Exclusions are always reset to empty array [] so new uploads never drop orders.
 */
export function loadSavedConfig(): ProcessingConfig {
  if (typeof window === "undefined") {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CONFIG;

    const parsed = JSON.parse(raw);

    // If localStorage contained legacy exclusions, clean it up
    if (parsed.excluded_main_skus || parsed.excluded_skus || parsed.excluded_couriers || parsed.excluded_order_ids) {
      delete parsed.excluded_main_skus;
      delete parsed.excluded_skus;
      delete parsed.excluded_couriers;
      delete parsed.excluded_order_ids;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
      } catch {
        // ignore
      }
    }

    return {
      output_format: parsed.output_format || DEFAULT_CONFIG.output_format,
      sort_by: parsed.sort_by || DEFAULT_CONFIG.sort_by,
      remove_invoice:
        typeof parsed.remove_invoice === "boolean"
          ? parsed.remove_invoice
          : DEFAULT_CONFIG.remove_invoice,
      enable_sku_picklist:
        typeof parsed.enable_sku_picklist === "boolean"
          ? parsed.enable_sku_picklist
          : DEFAULT_CONFIG.enable_sku_picklist,
      // Fresh new batch always starts with 0 exclusions
      excluded_main_skus: [],
      excluded_skus: [],
      excluded_couriers: [],
      excluded_order_ids: [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Auto-save user's general preferences to localStorage.
 * Batch exclusions are purposefully stripped so future uploads start clean.
 */
export function saveUserConfig(config: ProcessingConfig): void {
  if (typeof window === "undefined") return;

  try {
    const cleanToSave = {
      output_format: config.output_format,
      sort_by: config.sort_by,
      remove_invoice: config.remove_invoice,
      enable_sku_picklist: config.enable_sku_picklist,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cleanToSave));
  } catch {
    // Non-fatal if storage quota is full or disabled
  }
}
