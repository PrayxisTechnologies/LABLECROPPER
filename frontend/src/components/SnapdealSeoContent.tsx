"use client";

import React, { useState } from "react";
import Link from "next/link";

interface FAQItem {
  question: string;
  answer: string;
}

const SNAPDEAL_FAQS: FAQItem[] = [
  {
    question: "How do I crop Snapdeal shipping labels into a 4×6 thermal format?",
    answer:
      "Download your combined bulk PDF orders or invoice packslips from the Snapdeal Seller Panel. Drop the file into LabelFlow above. Our high-precision vector engine isolates the lower shipping packslip, removes the upper customer GST tax invoice, and produces a print-ready 4×6 inch (100×150 mm) vector thermal PDF.",
  },
  {
    question: "Will Delhivery and courier automated sorting machines scan the cropped label barcodes?",
    answer:
      "Yes. Snapdeal parcels are dispatched through Delhivery, Shadowfax, Xpressbees, and other partners. LabelFlow preserves mathematical vector paths with zero blur, maintaining 100% quiet zones for both courier tracking barcodes and Snapdeal reference barcodes (SLP numbers).",
  },
  {
    question: "Can I organize Snapdeal packets by SKU and Courier Partner?",
    answer:
      "Yes. With the 'SKU + Delivery Partner' sorting mode, your parcels are automatically grouped by Main SKU and carrier (e.g. all Delhivery labels grouped together, then Shadowfax). A matching warehouse picklist CSV is also provided.",
  },
  {
    question: "What thermal printer settings should I use for Snapdeal labels?",
    answer:
      "Set your thermal printer page size to 4×6 inches (100×150 mm or 4.00 × 6.00 in). Our output PDF includes 10 pt safe padding on all four edges so hardware printer rollers never clip barcodes or text.",
  },
  {
    question: "Is LabelFlow free for Snapdeal sellers?",
    answer:
      "Yes, 100% Free! You can process unlimited Snapdeal PDF manifests with zero subscription fees, no watermarks, and fast local processing.",
  },
];

export const SnapdealSeoContent: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SNAPDEAL_FAQS.map((faq) => ({
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

      {/* Hero Explainer Section */}
      <section className="space-y-4 max-w-4xl">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-800/60">
          <span>Snapdeal Seller Toolkit</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
          Snapdeal Shipping Label Cropper & 4×6 Thermal Converter
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Snapdeal generates combined A4 invoice-packslips with customer GST invoices on the upper half and shipping barcodes on the lower half. LabelFlow automatically separates the tax invoice, crops the packslip with exact borders, and prepares 4×6 direct thermal roll stickers for high-speed dispatch.
        </p>
      </section>

      {/* Feature Highlights Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-navy-800/40 border border-slate-200 dark:border-navy-700/80 shadow-sm space-y-2">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center text-red-600 dark:text-red-400 font-bold text-lg mb-2">
            ✂️
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Auto Invoice Removal
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Eliminates paper waste and ink costs by stripping out upper A4 GST invoices and preserving only the shipping label box.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-navy-800/40 border border-slate-200 dark:border-navy-700/80 shadow-sm space-y-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-neon/15 flex items-center justify-center text-cyan-600 dark:text-cyan-neon font-bold text-lg mb-2">
            🚚
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Multi-Carrier Sorting
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Automatically sorts packets by courier partner (Delhivery, Shadowfax, Xpressbees) so your team packs handover bags accurately.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-navy-800/40 border border-slate-200 dark:border-navy-700/80 shadow-sm space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-lg mb-2">
            🏷️
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            SKU Intelligence & Picklists
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Extracts product codes and generates consolidated warehouse picking lists so your staff picks inventory 5× faster.
          </p>
        </div>
      </section>

      {/* Step-by-Step Guide */}
      <section className="space-y-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          How to Crop Snapdeal Shipping Labels in 3 Easy Steps
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 space-y-1">
            <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">STEP 1</span>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Download PDF from Snapdeal</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Go to Snapdeal Seller Panel &gt; Orders &gt; Print Invoice &amp; Packslip for ready shipments.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 space-y-1">
            <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">STEP 2</span>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Upload to LabelFlow</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Drag &amp; drop the PDF into the cropper. The engine crops the label and sorts by courier in seconds.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 space-y-1">
            <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">STEP 3</span>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Print on 4×6 Thermal Roll</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Click &quot;Print Labels&quot; or download the thermal PDF to print stickers with 100% barcode clarity.
            </p>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          Frequently Asked Questions (FAQ)
        </h3>
        <div className="space-y-3">
          {SNAPDEAL_FAQS.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={faq.question}
                className="rounded-xl border border-slate-200 dark:border-navy-700/80 bg-white dark:bg-navy-800/40 overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(index)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                >
                  <span>{faq.question}</span>
                  <span className="text-lg font-mono text-slate-400 ml-3">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-navy-700/40 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
