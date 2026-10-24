"use client";

import React from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function FeaturesPage() {
  const features = [
    {
      title: "Smart Label Cropping & Layout Detection",
      description:
        "Automatically identifies standard Meesho split-page layouts (top shipping label, bottom tax invoice). Safely extracts the shipping label and isolates customer tax invoices without ever clipping barcodes, QR codes, or recipient addresses.",
      tag: "Rule-Based Safety",
      icon: (
        <svg className="w-6 h-6 text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      ),
    },
    {
      title: "Deterministic Courier Partner Sorting",
      description:
        "Detects logistics partners—including Delhivery, Shadowfax, Ekart, Valmo, Xpressbees, Ecom Express, Blue Dart, and DTDC—and groups print batches by carrier for rapid, error-free warehouse handoffs.",
      tag: "Deterministic Carrier Engine",
      icon: (
        <svg className="w-6 h-6 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      title: "Warehouse SKU Picklist Compilation",
      description:
        "Aggregates order line items across all processed labels to generate a consolidated warehouse picklist CSV. Distinguishes item quantities from parcel counts so fulfillment staff can pick inventory before packing.",
      tag: "CSV Export",
      icon: (
        <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      ),
    },
    {
      title: "Exact 4 × 6 Inch Direct Thermal Formatting",
      description:
        "Outputs strict 288 × 432 pt thermal vector pages using PyMuPDF vector rendering. Maintains aspect ratio, prevents squishing or distortion, and produces razor-sharp barcodes for flawless handheld scanner reading.",
      tag: "Vector Fidelity",
      icon: (
        <svg className="w-6 h-6 text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      ),
    },
    {
      title: "Ambiguity Safeguard & Preservation",
      description:
        "Never silently drops pages or crops uncertain content. If invoice borders are ambiguous or recipient details extend into unexpected zones, the full page is preserved and flagged for human review.",
      tag: "Zero Data Loss",
      icon: (
        <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      title: "Live In-Browser Preview Before Download",
      description:
        "Review your cropped 4×6 thermal pages, verify courier detection, and inspect SKU tags directly in your browser before committing to a print run or download.",
      tag: "Instant Feedback",
      icon: (
        <svg className="w-6 h-6 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 w-full">
        <div className="space-y-2 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-xs font-semibold text-cyan-600 dark:text-cyan-neon">
            <span>Features Overview</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Built for High-Volume Sellers
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Every feature in LabelFlow is designed to eliminate dispatch friction,
            reduce paper waste, and prevent warehouse sorting mistakes across Meesho, Flipkart, Amazon, Myntra, and Snapdeal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
          {features.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-white dark:bg-navy-850/80 border border-slate-200 dark:border-navy-700/80 hover:border-cyan-500/50 dark:hover:border-cyan-neon/40 transition-all space-y-3 shadow-sm dark:shadow-card"
            >
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-navy-700">
                  {item.icon}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-navy-700">
                  {item.tag}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                {item.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div className="p-8 rounded-2xl bg-gradient-to-r from-slate-100 via-white to-slate-100 dark:from-navy-850 dark:via-navy-800 dark:to-navy-850 border border-slate-300 dark:border-cyan-neon/30 text-center space-y-4 shadow-sm dark:shadow-glow">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Ready to generate your 4×6 thermal labels?
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
            Upload your shipping batch now. Zero sign-up required, instant one-click generation.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold text-sm shadow-glow hover:brightness-110 active:scale-95 transition-all"
            >
              Start Cropping Labels
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
