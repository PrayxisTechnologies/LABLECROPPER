"use client";

import React, { useState } from "react";
import Link from "next/link";

interface FAQItem {
  question: string;
  answer: string;
}

const HOME_FAQS: FAQItem[] = [
  {
    question: "What is LabelCropper and who is it designed for?",
    answer:
      "LabelCropper (by Prayxis Technologies) is a free, high-speed online utility engineered for Indian e-commerce sellers on Meesho, Flipkart, Amazon, Myntra, and Snapdeal. It converts raw A4 bulk manifests into standard 4×6 inch (100×150 mm) direct thermal roll stickers, removes unwanted tax invoices, and organizes packages by SKU and delivery partner (Valmo, Ekart, Shadowfax, Delhivery).",
  },
  {
    question: "How does LabelCropper preserve barcode scannability?",
    answer:
      "Unlike ordinary croppers that take low-resolution 72 DPI image screenshots, LabelCropper utilizes a native PyMuPDF vector engine. All barcodes, QR codes, 2D data matrices, and text elements remain mathematically sharp at 300+ DPI, ensuring 100% scan rates on courier logistics conveyor scanners.",
  },
  {
    question: "Which marketplaces are currently supported?",
    answer:
      "LabelCropper provides built-in crop and parsing logic for Meesho, Flipkart (Ekart logistics), Amazon Easy Ship & FBA, Myntra, and Snapdeal. If you sell on another portal, our universal PDF auto-cropper will automatically isolate the label rectangle.",
  },
  {
    question: "Is there any cost, monthly subscription, or watermark?",
    answer:
      "No. LabelCropper is 100% free with no watermarks, no registration hurdles, and no daily upload quotas.",
  },
  {
    question: "How does SKU and courier sorting speed up daily warehouse dispatch?",
    answer:
      "Normally, orders come mixed up in random order. LabelCropper's smart sorting groups all orders for the same SKU together (so your team packs 50 pieces of the same item at once) and groups them by courier partner (Valmo, Shadowfax, Delhivery) so you can hand over packed bags in under 2 minutes when pickup executives arrive.",
  },
  {
    question: "Is my customer data secure?",
    answer:
      "Yes, completely. Files are processed in ephemeral memory and immediately purged from temporary buffers. We never store, aggregate, or distribute customer names, shipping addresses, or commercial invoice data.",
  },
];

export const HomeSeoContent: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQS.map((faq) => ({
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

      {/* Hero Overview */}
      <section className="space-y-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/60 text-xs font-bold text-cyan-700 dark:text-cyan-400">
          <span>⚡ India&apos;s #1 E-Commerce Shipping Label Cropper</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Universal Shipping Label Cropper &amp; Courier Sorter (4×6 Thermal)
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          The ultimate fulfillment tool for Indian online merchants. Crop multi-page A4 PDFs to 4×6 direct thermal rolls, separate tax invoices, and group packages by delivery partner in 1 click.
        </p>

        {/* Marketplace Logos / Badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-bold">
          <Link
            href="/meesho-label-cropper"
            className="px-4 py-2 rounded-xl bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800/50 text-pink-700 dark:text-pink-300 hover:border-pink-500 transition-colors"
          >
            Meesho Cropper (Valmo / Shadowfax)
          </Link>
          <Link
            href="/flipkart-label-cropper"
            className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 hover:border-blue-500 transition-colors"
          >
            Flipkart Cropper (Ekart)
          </Link>
          <Link
            href="/amazon"
            className="px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 hover:border-amber-500 transition-colors"
          >
            Amazon Easy Ship &amp; FBA
          </Link>
          <Link
            href="/myntra"
            className="px-4 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-300 hover:border-purple-500 transition-colors"
          >
            Myntra Logistics
          </Link>
        </div>
      </section>

      {/* Section 2: How It Works */}
      <section className="space-y-6 max-w-4xl mx-auto p-6 sm:p-8 rounded-2xl bg-white dark:bg-navy-850/60 border border-slate-200 dark:border-navy-700/60 shadow-sm">
        <div className="space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
            How It Works
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            Transform Your Dispatch in 3 Steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              1
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Upload Batch PDF
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Drop your bulk shipping label PDF from Meesho, Flipkart, or Amazon. Supports files up to 50MB and 500+ pages.
            </p>
          </div>

          <div className="space-y-2">
            <div className="w-9 h-9 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              2
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Vector Crop &amp; Smart Sort
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Isolates the 4×6 label, removes tax invoices, and organizes orders by Main SKU and delivery partner (Valmo, Ekart, Shadowfax).
            </p>
          </div>

          <div className="space-y-2">
            <div className="w-9 h-9 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              3
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Print Thermal Roll
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Download the 4×6 PDF or print directly from your browser. Peel and stick labels onto polybags without tape.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: Cost & Efficiency Comparison */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Why Direct Thermal (4×6) Beats A4 Laser Printing
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Compare the operational cost of traditional A4 paper vs direct thermal sticker rolls.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-navy-850/60 border border-rose-200 dark:border-rose-900/50 shadow-sm space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-xs">
              ❌ Traditional A4 Printing
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <li>• Requires expensive laser toner cartridges (₹1,500 - ₹3,000).</li>
              <li>• Requires scissors cutting and transparent packaging tape.</li>
              <li>• 100 orders take 1.5 - 2 hours to cut, tape, and sort.</li>
              <li>• Barcodes get scuffed and wrinkled under tape, causing pickup failures.</li>
              <li>• Total cost per parcel: <strong>₹1.50 - ₹2.50</strong>.</li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-navy-850/60 border border-emerald-200 dark:border-emerald-800/60 shadow-sm space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
              ✅ 4×6 Direct Thermal with LabelCropper
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <li>• <strong>Zero ink or toner required</strong> (direct heat transfer).</li>
              <li>• Peel-and-stick self-adhesive labels (zero tape needed).</li>
              <li>• 100 labels print in 60 seconds with automated courier sorting.</li>
              <li>• 100% crisp barcodes that scan in 0.2 seconds.</li>
              <li>• Total cost per parcel: <strong>Just ₹0.25 - ₹0.35</strong>.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 4: Interactive FAQ Accordion */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
            Frequently Asked Questions
          </span>
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Common Questions About E-Commerce Label Cropping
          </h2>
        </div>

        <div className="space-y-3 pt-2">
          {HOME_FAQS.map((faq, idx) => {
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

      {/* Section 5: Educational Guides Links */}
      <section className="p-6 sm:p-8 rounded-2xl bg-gradient-to-tr from-cyan-950/20 via-purple-950/20 to-navy-900 border border-slate-200 dark:border-navy-700/60 max-w-4xl mx-auto space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Learn How to Optimize Your Dispatch Operations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <Link
            href="/blogs/how-to-crop-meesho-shipping-labels-4x6-thermal-printer"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>How to Crop Meesho Labels (Complete Guide)</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/best-thermal-printers-for-ecommerce-sellers-in-india"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Top 5 Thermal Printers for Indian Sellers</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/flipkart-shipping-label-cropper-ekart-guide"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Flipkart Ekart Barcode &amp; Quiet Zone Setup</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/how-sku-courier-sorting-saves-time-in-warehouse"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Warehouse SKU &amp; Courier Sorting Methodology</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
};
