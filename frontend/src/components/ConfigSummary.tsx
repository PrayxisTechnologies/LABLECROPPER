"use client";

import React from "react";
import { ProcessingConfig } from "@/lib/types";

interface ConfigSummaryProps {
  config: ProcessingConfig;
  onChange?: (newConfig: ProcessingConfig) => void;
  disabled?: boolean;
}

export const ConfigSummary: React.FC<ConfigSummaryProps> = ({
  config,
  onChange,
  disabled = false,
}) => {
  const toggleInvoice = () => {
    if (!disabled && onChange) {
      onChange({ ...config, remove_invoice: !config.remove_invoice });
    }
  };

  const togglePicklist = () => {
    if (!disabled && onChange) {
      onChange({ ...config, enable_sku_picklist: !config.enable_sku_picklist });
    }
  };

  const cards = [
    {
      title: "Output Format",
      value: config.output_format === "4x6_thermal" ? "4 × 6 inch thermal label" : "A4 Grid Layout",
      subtext: "100 × 150 mm (288 × 432 pt) direct thermal roll standard",
      tag: "Standard Roll",
      interactive: false,
      icon: (
        <svg
          className="w-5 h-5 text-cyan-neon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="9" y1="6" x2="15" y2="6" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      ),
    },
    {
      title: "Batch Sorting",
      value: "Courier partner",
      subtext: "Auto-groups Delhivery, Shadowfax, Xpressbees, Ekart, Valmo",
      tag: "Deterministic",
      interactive: false,
      icon: (
        <svg
          className="w-5 h-5 text-purple-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      title: "Invoice Handling",
      value: config.remove_invoice ? "Remove when reliably detected" : "Preserve all invoice pages",
      subtext: config.remove_invoice
        ? "Safely filters customer tax invoices without dropping parcel addresses"
        : "Leaves invoice pages intact in generated PDF stream",
      tag: config.remove_invoice ? "Roll Saver ON" : "Roll Saver OFF",
      interactive: true,
      onToggle: toggleInvoice,
      active: config.remove_invoice,
      icon: (
        <svg
          className="w-5 h-5 text-cyan-neon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
    },
    {
      title: "SKU Picklist",
      value: config.enable_sku_picklist ? "Enabled" : "Disabled",
      subtext: config.enable_sku_picklist
        ? "Generates consolidated warehouse picking sheet and CSV"
        : "Picklist generation skipped",
      tag: config.enable_sku_picklist ? "Warehouse Ready" : "Skipped",
      interactive: true,
      onToggle: togglePicklist,
      active: config.enable_sku_picklist,
      icon: (
        <svg
          className="w-5 h-5 text-purple-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full bg-navy-850 rounded-2xl border border-navy-700/80 p-5 sm:p-6 shadow-card space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-navy-700/60">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-purple-brand" />
          <h3 className="font-semibold text-white text-base">
            Processing Configuration Summary
          </h3>
        </div>
        <span className="text-[11px] font-medium text-slate-400 bg-navy-900 px-2.5 py-1 rounded-md border border-navy-700">
          Preset: Meesho High-Volume Thermal
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {cards.map((c, index) => (
          <div
            key={index}
            onClick={c.interactive && !disabled ? c.onToggle : undefined}
            className={`flex items-start space-x-3.5 p-3.5 rounded-xl bg-navy-900/90 border transition-all ${
              c.interactive && !disabled
                ? "cursor-pointer hover:border-cyan-neon/40 hover:bg-navy-800"
                : "border-navy-700/60"
            }`}
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-navy-800 border border-navy-700 flex items-center justify-center">
              {c.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-slate-400 font-medium">
                  {c.title}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    c.interactive
                      ? c.active
                        ? "bg-cyan-neon/15 text-cyan-neon border-cyan-neon/30"
                        : "bg-navy-800 text-slate-400 border-navy-700"
                      : "bg-navy-800 text-slate-300 border-navy-700"
                  }`}
                >
                  {c.tag}
                </span>
              </div>
              <p className="text-sm font-semibold text-white mt-0.5 truncate">
                {c.value}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {c.subtext}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
