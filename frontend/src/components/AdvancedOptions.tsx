"use client";

import React, { useState } from "react";
import { ProcessingConfig, SortOption } from "@/lib/types";
import { saveUserConfig } from "@/lib/storage";

interface AdvancedOptionsProps {
  config: ProcessingConfig;
  onChange: (newConfig: ProcessingConfig) => void;
  disabled?: boolean;
}

export const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
  config,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value as SortOption;
    // Auto-enable picklist if SKU sorting is selected
    const shouldEnablePicklist =
      newSort === "sku" || newSort === "sku_courier"
        ? true
        : config.enable_sku_picklist;

    const updated: ProcessingConfig = {
      ...config,
      sort_by: newSort,
      enable_sku_picklist: shouldEnablePicklist,
    };
    saveUserConfig(updated);
    onChange(updated);
  };

  const handleInvoiceToggle = () => {
    if (disabled) return;
    const updated: ProcessingConfig = {
      ...config,
      remove_invoice: !config.remove_invoice,
    };
    saveUserConfig(updated);
    onChange(updated);
  };

  const handlePicklistToggle = () => {
    if (disabled) return;
    const updated: ProcessingConfig = {
      ...config,
      enable_sku_picklist: !config.enable_sku_picklist,
    };
    saveUserConfig(updated);
    onChange(updated);
  };

  const isSkuSorting =
    config.sort_by === "sku" ||
    config.sort_by === "sku_courier" ||
    config.sort_by === "marketplace_sku_courier" ||
    config.sort_by === "sku_marketplace_courier" ||
    config.sort_by === "courier_sku_marketplace" ||
    config.sort_by === "courier_marketplace_sku" ||
    config.sort_by === "sku_courier_marketplace";

  const getSortLabel = (sort: string) => {
    switch (sort) {
      case "marketplace":
        return "Platform First (Meesho → Flipkart → Snapdeal)";
      case "marketplace_sku_courier":
        return "Platform → SKU → Delivery partner";
      case "marketplace_courier":
        return "Platform → Delivery partner";
      case "courier_sku_marketplace":
        return "Delivery partner → SKU → Platform";
      case "courier_marketplace_sku":
        return "Delivery partner → Platform → SKU";
      case "sku_marketplace_courier":
        return "SKU → Platform → Delivery partner";
      case "sku_courier_marketplace":
        return "SKU → Delivery partner → Platform";
      case "sku":
        return "SKU";
      case "courier_partner":
        return "Delivery partner";
      case "sku_courier":
        return "SKU + Delivery partner";
      case "original_order":
      default:
        return "Original order";
    }
  };

  return (
    <div className="w-full bg-white dark:bg-navy-850 rounded-2xl border border-slate-200 dark:border-navy-700/80 transition-all shadow-sm dark:shadow-card overflow-hidden">
      {/* Expandable Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-navy-800/60 transition-colors focus:outline-none"
      >
        <div className="flex items-center space-x-2.5">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? "rotate-90 text-cyan-600 dark:text-cyan-neon" : "text-slate-400"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-sm font-semibold text-slate-800 dark:text-white">
            Advanced options
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
            ({getSortLabel(config.sort_by)} •{" "}
            {config.remove_invoice ? "Invoice filter ON" : "Invoice filter OFF"})
          </span>
        </div>

        <span className="text-xs text-cyan-600 dark:text-cyan-neon hover:underline font-medium">
          {isOpen ? "Hide options" : "Customize"}
        </span>
      </button>

      {/* Collapsed Disclosure Content */}
      {isOpen && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-200 dark:border-navy-700/60 space-y-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* A. Remove Extra Content Toggle */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-navy-900/90 border border-slate-200 dark:border-navy-700/70 flex items-start justify-between space-x-3">
              <div className="space-y-1 pr-2">
                <label
                  htmlFor="toggle-remove-invoice"
                  className="text-xs font-semibold text-slate-800 dark:text-white block cursor-pointer"
                >
                  Remove invoice / extra blank area
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Safely removes customer tax invoice and whitespace without
                  cutting barcodes, QR codes, or address info. Ambiguous layouts
                  are preserved for review.
                </p>
              </div>
              <button
                id="toggle-remove-invoice"
                type="button"
                role="switch"
                aria-checked={config.remove_invoice}
                onClick={handleInvoiceToggle}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  config.remove_invoice ? "bg-cyan-500 dark:bg-cyan-neon" : "bg-slate-300 dark:bg-navy-700"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-navy-950 shadow ring-0 transition duration-200 ease-in-out ${
                    config.remove_invoice ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* B. Organize Labels Selector */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-navy-900/90 border border-slate-200 dark:border-navy-700/70 space-y-1.5">
              <label
                htmlFor="select-organize-labels"
                className="text-xs font-semibold text-slate-800 dark:text-white block"
              >
                Organize labels by
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose how output 4×6 thermal pages are grouped in the PDF.
              </p>
              <div className="relative pt-1">
                <select
                  id="select-organize-labels"
                  value={config.sort_by}
                  onChange={handleSortChange}
                  disabled={disabled}
                  className="w-full appearance-none bg-white dark:bg-navy-800 border border-slate-300 dark:border-navy-600 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-cyan-neon pr-8 cursor-pointer disabled:opacity-50 font-medium"
                >
                  <optgroup label="🏪 Platform / Marketplace First (Meesho, fir Flipkart, fir Snapdeal)">
                    <option value="marketplace">🏪 Platform First (All Meesho → Flipkart → Snapdeal)</option>
                    <option value="marketplace_sku_courier">🏷️ Platform + SKU + Delivery Partner</option>
                    <option value="marketplace_courier">🚚 Platform + Delivery Partner</option>
                  </optgroup>
                  <optgroup label="🚚 Delivery Partner Primary (Valmo, Shadowfax, Ekart...)">
                    <option value="courier_sku_marketplace">🚚 Delivery Partner + SKU + Platform</option>
                    <option value="courier_marketplace_sku">🚚 Delivery Partner + Platform + SKU</option>
                    <option value="courier_partner">🚚 Delivery Partner Only (Valmo, Shadowfax...)</option>
                  </optgroup>
                  <optgroup label="📦 SKU / Product First">
                    <option value="sku_marketplace_courier">📦 SKU + Platform + Delivery Partner</option>
                    <option value="sku_courier_marketplace">🏷️ SKU + Delivery Partner + Platform</option>
                    <option value="sku_courier">
                      🏷️ SKU + Delivery partner (Standard)
                    </option>
                    <option value="sku">📦 SKU Variants Only</option>
                  </optgroup>
                  <optgroup label="📄 Document Order">
                    <option value="original_order">
                      📄 Original order (input PDF sequence)
                    </option>
                  </optgroup>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 pt-1 text-slate-400">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* C. Picklist Generation Checkbox */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-navy-900/90 border border-slate-200 dark:border-navy-700/70 flex items-start justify-between space-x-3">
            <div className="space-y-1 pr-2">
              <label
                htmlFor="toggle-picklist"
                className="text-xs font-semibold text-slate-800 dark:text-white block cursor-pointer"
              >
                Generate SKU picklist CSV
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Aggregates order line items into a warehouse item picking list
                with unit counts and courier partners.
                {isSkuSorting && (
                  <span className="text-cyan-600 dark:text-cyan-neon ml-1 font-medium">
                    (Automatically included with SKU sorting)
                  </span>
                )}
              </p>
            </div>
            <button
              id="toggle-picklist"
              type="button"
              role="switch"
              aria-checked={config.enable_sku_picklist || isSkuSorting}
              onClick={handlePicklistToggle}
              disabled={disabled || isSkuSorting}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.enable_sku_picklist || isSkuSorting
                  ? "bg-purple-600 dark:bg-purple-brand"
                  : "bg-slate-300 dark:bg-navy-700"
              } ${disabled || isSkuSorting ? "cursor-not-allowed opacity-90" : "cursor-pointer"}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-navy-950 shadow ring-0 transition duration-200 ease-in-out ${
                  config.enable_sku_picklist || isSkuSorting
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
