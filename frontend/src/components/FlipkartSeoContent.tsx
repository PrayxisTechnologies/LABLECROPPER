"use client";

import React, { useState } from "react";
import Link from "next/link";

interface FAQItem {
  question: string;
  answer: string;
}

const FLIPKART_FAQS: FAQItem[] = [
  {
    question: "How do I crop Flipkart shipping labels into a 4×6 thermal format?",
    answer:
      "Download your combined bulk PDF orders from the Flipkart Seller Hub (Orders > Dispatch). Drop the file into LabelCropper above. Our vector processing engine isolates the upper Ekart shipping label, removes the customer GST invoice, and outputs a print-ready 4×6 inch (100×150 mm) vector PDF.",
  },
  {
    question: "Will Ekart automated sorter machines scan the cropped label barcode?",
    answer:
      "Yes. Ekart uses high-speed conveyor scanners at hub facilities. Unlike screenshot tools that distort barcode quiet zones, LabelCropper preserves mathematical vector paths at 300+ DPI, ensuring flawless scanning by automated sorting arms.",
  },
  {
    question: "Can I separate orders handled by Ekart from Shadowfax and Delhivery?",
    answer:
      "Yes. Flipkart assigns various logistics partners including Ekart Logistics, Delhivery, and Shadowfax. Selecting 'SKU + Delivery Partner' sorting groups all packets by courier partner so you can pack each carrier's dispatch bag separately.",
  },
  {
    question: "What is the best thermal printer for printing Flipkart labels?",
    answer:
      "TVS LP 46 Neo, TSC TE244, and Xprinter XP-420B are the most widely used direct thermal label printers among Flipkart sellers in India. They support standard 4×6 direct thermal sticker rolls with zero ink or ribbon required.",
  },
  {
    question: "Is LabelCropper free for Flipkart sellers?",
    answer:
      "Yes, 100% Free! You can process as many Flipkart PDF manifests as you need with zero subscription fees, no watermarks, and no sign-up requirement.",
  },
];

export const FlipkartSeoContent: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FLIPKART_FAQS.map((faq) => ({
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

      {/* Section 1: Highlights */}
      <section className="space-y-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/60 text-xs font-bold text-cyan-700 dark:text-cyan-400">
          <span>⚡ Optimized for Flipkart Seller Hub Manifests</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Flipkart Shipping Label Cropper (4×6 Thermal Format)
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Say goodbye to manual scissors cutting and messy tape. Convert bulk Flipkart A4 invoice-label PDFs into clean 4×6 inch self-adhesive thermal roll labels with zero barcode distortion.
        </p>

        {/* 4 Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 text-left">
          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-lg">
              📄
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              GST Invoice Separation
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Splits the customer tax invoice from the Ekart shipping label so you don&apos;t waste thermal sticker rolls.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg">
              🎯
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Ekart Barcode Protection
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Maintains standard barcode quiet zones so high-speed mother hub conveyor sorters never reject packets.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
              📦
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Carrier Sorting
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Separates Ekart Logistics parcels from Delhivery and Shadowfax packets for instant courier handover.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700/70 shadow-sm space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
              ⚡
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Batch Processing
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Process 500+ Flipkart orders simultaneously in seconds without lagging or browser freezing.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Step-by-Step Tutorial */}
      <section className="space-y-6 max-w-4xl mx-auto p-6 sm:p-8 rounded-2xl bg-white dark:bg-navy-850/60 border border-slate-200 dark:border-navy-700/60 shadow-sm">
        <div className="space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
            Quick Tutorial
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            How to Crop Flipkart Labels for Thermal Printing
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              1
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Download PDF from Flipkart Seller Hub
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Go to <strong>Orders &gt; Active Orders</strong>, click <strong>Generate Labels &amp; Invoices</strong>, and download the aggregated PDF.
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
                Drag your Flipkart PDF into the upload zone above. The vector engine processes each page automatically.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              3
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Choose Sorting &amp; Picklist Options
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Sort by SKU and carrier partner to group identical items together and speed up warehouse packaging.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow">
              4
            </span>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Print Directly on 4×6 Thermal Roll
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Send to your TVS, TSC, or Xprinter machine with paper size set to 4×6 inches. Peel and stick directly on polybags.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: FAQ */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <span className="text-xs uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
            FAQ
          </span>
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Frequently Asked Questions for Flipkart Sellers
          </h2>
        </div>

        <div className="space-y-3 pt-2">
          {FLIPKART_FAQS.map((faq, idx) => {
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

      {/* Section 4: Related Guides */}
      <section className="p-6 sm:p-8 rounded-2xl bg-gradient-to-tr from-cyan-950/20 via-purple-950/20 to-navy-900 border border-slate-200 dark:border-navy-700/60 max-w-4xl mx-auto space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Helpful Flipkart Guides
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <Link
            href="/blogs/flipkart-shipping-label-cropper-ekart-guide"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Ekart Logistics & Barcode Quiet Zone Guide</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/blogs/flipkart-shipping-label-cropper-thermal-setup-guide"
            className="p-3.5 rounded-xl bg-white/70 dark:bg-navy-850/70 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 transition-all font-medium flex items-center justify-between group"
          >
            <span>Flipkart Thermal Printer Setup & DPI Rules</span>
            <span className="text-cyan-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
};
