/**
 * LabelFlow User Settings Local Storage Helper
 * Persists user's customized options (Sort order, invoice filter, picklist)
 * across browser sessions.
 */

import { ProcessingConfig } from "./types";

const SETTINGS_KEY = "labelflow_user_preferences_v2";

export const DEFAULT_CONFIG: ProcessingConfig = {
  output_format: "4x6_thermal",
  sort_by: "sku_courier", // Default: SKU + Delivery partner (Main SKU first)
  remove_invoice: true,
  enable_sku_picklist: true,
};

/**
 * Load saved configuration from localStorage, or return smart defaults.
 */
export function loadSavedConfig(): ProcessingConfig {
  if (typeof window === "undefined") {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CONFIG;

    const parsed = JSON.parse(raw);
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
      excluded_main_skus: Array.isArray(parsed.excluded_main_skus) ? parsed.excluded_main_skus : [],
      excluded_skus: Array.isArray(parsed.excluded_skus) ? parsed.excluded_skus : [],
      excluded_couriers: Array.isArray(parsed.excluded_couriers) ? parsed.excluded_couriers : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Auto-save user's configuration to localStorage.
 */
export function saveUserConfig(config: ProcessingConfig): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
  } catch {
    // Non-fatal if storage quota is full or disabled
  }
}
