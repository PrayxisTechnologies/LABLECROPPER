"use client";

import React, { useState } from "react";
import Link from "next/link";

interface FAQItem {
  question: string;
  answer: string;
}

const MEESHO_FAQS: FAQItem[] = [
  {
    question: "How do I crop Meesho shipping labels for a 4×6 direct thermal printer?",
    answer:
      "Simply download your ready-to-ship orders manifest PDF from the Meesho Supplier Panel (under Orders > Ready to Ship). Drag and drop the PDF into LabelCropper above. Our vector engine instantly isolates the upper shipping label, discards the tax invoice, resizes it to standard 4×6 inches (100×150 mm), and organizes labels by delivery partner (Valmo, Shadowfax, Delhivery) in under 3 seconds.",
  },
  {
    question: "Is LabelCropper free to use for Meesho suppliers?",
    answer:
      "Yes, 100% Free! There are no hidden subscription charges, no watermarks, and no limits on the number of Meesho label PDFs you can process each day.",
  },
  {
    question: "How does LabelCropper separate Valmo, Shadowfax, and Delhivery courier packets?",
    answer:
      "Our backend PyMuPDF engine reads the carrier identifier (such as Valmo, Shadowfax, Delhivery, Xpressbees) printed on each Meesho label. By choosing the 'SKU + Delivery Partner' sorting option, your printed labels will come out grouped by courier so you can drop Valmo parcels into the green bag and Shadowfax parcels into the yellow bag without sorting manually.",
  },
  {
    question: "Will the barcodes still be scannable by courier pickup executives?",
    answer:
      "Absolutely. Unlike screenshot-based croppers that degrade images to 72 DPI, LabelCropper uses native vector extraction. Barcodes, QR codes, tracking AWBs, and customer addresses remain pin-sharp at 300+ DPI resolution, ensuring 100% scan success at first try.",
  },
  {
    question: "What printer settings should I use for 4×6 thermal label rolls?",
    answer:
      "In your computer's print dialog, select Paper Size as '4×6 inches (100×150 mm)' or 'User Defined 100×150mm'. Set Margins to 'None' and Scale to 'Fit to Printable Area' (or 100%). For print darkness/density, select 10 to 12.",
  },
  {
    question: "Are my customer addresses and order details stored or shared?",
    answer:
      "No. We take seller data privacy seriously. All PDF cropping is performed in temporary volatile memory and automatically purged after generation. We never save, harvest, or share your customer data.",
  },
];

export const MeeshoSeoContent: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // Structured Data for Google Rich Snippets (FAQPage Schema)
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: MEESHO_FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="w-full space-y-16 mt-16 pt-12 border-t border-slate-200 dark:border-navy-700/60 text-slate-800 dark:text-slate-200">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Section 1: Value Proposition & Highlights */}
      <section className="space-y-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/60 text-xs font-bold text-cyan-700 dark:text-cyan-400">
          <span>🚀 Built Specifically for Indian Meesho Suppliers</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Why Top Meesho Sellers Use LabelCropper for Daily Dispatch
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Downloading aggregated A4 PDFs from the Meesho Supplier Hub leaves you with unwanted tax invoices and oversized sheets. 
          LabelCropper transforms your entire dispatch workflow into an effortless 1-click experience.
        </p>

        {/* 4 Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 text-left">
          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-lg">
              ✂️
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Instant 4×6 Crop
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Separates the shipping label from the lower tax invoice automatically without cutting off routing barcodes.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg">
              🚚
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Valmo & Shadowfax Sort
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Auto-groups parcels by courier partner so you can fill Valmo, Shadowfax, and Delhivery pickup bags instantly.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
              📦
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Main SKU Picklist
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Generates a consolidated warehouse item count so your team picks 50 brown or green kurtis in a single batch.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
              🖨️
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              300+ DPI Thermal Vector
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              High-definition vector output guaranteed to scan on TVS, TSC, Zebra, Rollo, and Xprinter thermal machines.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Step-by-Step Tutorial */}
      <section className="space-y-6 max-w-4xl mx-auto p-6 sm:p-8 rounded-2xl bg-white dark:bg-navy-850/60 border border-slate-200 dark:border-navy-700/60 shadow-sm">
        <div className="space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
            How-To Guide
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            How to Crop & Print Meesho Labels in 4 Simple Steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              1
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Download PDF from Meesho Supplier Panel
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Log into your supplier dashboard, navigate to <strong>Orders &gt; Ready to Ship</strong>, select all pending orders, and click <strong>Download Shipping Labels</strong>.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              2
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Upload to LabelCropper
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Drag and drop your single or bulk Meesho PDF files into the tool above. No login or registration required.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              3
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Automatic Crop & Courier Sorting
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                The engine strips off customer tax invoices and groups labels by your chosen configuration (SKU first or Delivery Partner first).
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              4
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Print 4×6 Direct Thermal Labels
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Hit <strong>Print All Labels</strong>. Set paper size to 4×6 inches (100×150 mm) and stick the labels directly onto polybags!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Comparison Table */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">
            LabelCropper vs. Traditional Cutting Methods
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            See how upgrading to 1-click thermal label cropping saves your warehouse hours every day.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-navy-700/60 shadow-sm bg-white dark:bg-navy-850/60">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-navy-900/80 border-b border-slate-200 dark:border-navy-700/60 text-slate-700 dark:text-slate-200">
              <tr>
                <th className="p-3 sm:p-4 font-bold">Feature / Metric</th>
                <th className="p-3 sm:p-4 font-bold text-slate-500">Scissors / Paper Cutter</th>
                <th className="p-3 sm:p-4 font-bold text-slate-500">Manual Screenshot</th>
                <th className="p-3 sm:p-4 font-bold text-cyan-600 dark:text-cyan-400">LabelCropper Online</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700/40 text-slate-600 dark:text-slate-300">
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-slate-900 dark:text-white">Time per 100 Labels</td>
                <td className="p-3 sm:p-4 text-rose-500 font-medium">90 - 120 minutes</td>
                <td className="p-3 sm:p-4 text-rose-500 font-medium">45 - 60 minutes</td>
                <td className="p-3 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold">Under 3 seconds</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-slate-900 dark:text-white">Barcode Clarity</td>
                <td className="p-3 sm:p-4">Standard (Laser ink)</td>
                <td className="p-3 sm:p-4 text-rose-500">Blurry (72 DPI pixelated)</td>
                <td className="p-3 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold">300+ DPI Crisp Vector</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-slate-900 dark:text-white">Courier Sorting</td>
                <td className="p-3 sm:p-4 text-rose-500">Manual (Time consuming)</td>
                <td className="p-3 sm:p-4 text-rose-500">None</td>
                <td className="p-3 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold">Auto Valmo / Shadowfax</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-slate-900 dark:text-white">Consolidated SKU Picklist</td>
                <td className="p-3 sm:p-4 text-rose-500">No</td>
                <td className="p-3 sm:p-4 text-rose-500">No</td>
                <td className="p-3 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold">Yes (Instant Download)</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-slate-900 dark:text-white">Cost per Label</td>
                <td className="p-3 sm:p-4">₹1.50 - ₹2.00 (Paper + Toner)</td>
                <td className="p-3 sm:p-4">₹1.50 (Laser toner)</td>
                <td className="p-3 sm:p-4 text-emerald-600 dark:text-emerald-400 font-bold">₹0.25 (Direct Thermal)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Interactive FAQ Accordion */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
            Frequently Asked Questions
          </span>
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Got Questions About Meesho Label Cropping?
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Everything you need to know about setting up thermal printers, barcode scannability, and courier separation.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          {MEESHO_FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 dark:border-navy-700/60 bg-white dark:bg-navy-850/60 overflow-hidden transition-all shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-slate-900 dark:text-white hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  <span>{faq.question}</span>
                  <span className="text-lg flex-shrink-0 text-cyan-500">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-5 sm:px-5 sm:pb-6 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-navy-700/40 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 5: Helpful Related Guides */}
      <section className="p-6 sm:p-8 rounded-2xl bg-gradient-to-tr from-cyan-950/20 via-purple-950/20 to-navy-900 border border-slate-200 dark:border-navy-700/60 max-w-4xl mx-auto space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Popular Seller Tutorials for Meesho Merchants
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <Link
            href="/blogs/how-to-crop-meesho-shipping-labels-4x6-thermal-printer"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>How to Crop Meesho Labels for 4×6 Thermal Printer</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/best-thermal-printers-for-ecommerce-sellers-in-india"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Top 5 Thermal Printers for Indian Sellers (2026)</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/how-sku-courier-sorting-saves-time-in-warehouse"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>How SKU & Courier Sorting Saves 3+ Hours Daily</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/meesho-label-cropper-online-free-tool-guide-2026"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Meesho Supplier Panel Cropping Master Guide</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
};
