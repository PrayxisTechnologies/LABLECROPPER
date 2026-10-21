import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "How It Works — Universal E-Commerce 4×6 Shipping Label Cropper",
  description:
    "Learn how LabelFlow transforms bulk shipping label PDFs from Meesho, Flipkart, Amazon, Myntra, and Snapdeal into 4x6 print-ready thermal labels in 3 simple steps.",
  keywords: [
    "how to crop meesho labels",
    "flipkart label crop process",
    "amazon shipping label thermal format",
    "thermal printer 4x6 setup guide",
    "valmo shadowfax courier sorting",
  ],
};

export default function HowItWorksPage() {
  const steps = [
    {
      number: "1",
      title: "Download Order Batches from Any Seller Portal",
      description:
        "Log in to your seller dashboard (Meesho Supplier Panel, Flipkart Seller Hub, Amazon Seller Central, Myntra, or Snapdeal). Go to your Ready to Ship / Pending Orders section and download your bulk PDF label manifest.",
      tip: "Supports single-page or multi-page batch PDFs up to 50 MB.",
      badge: "Meesho • Flipkart • Amazon • Myntra",
    },
    {
      number: "2",
      title: "Upload & Choose Smart Organization Preferences",
      description:
        "Drag and drop your PDF into LabelFlow. LabelFlow automatically analyzes page layouts. You can keep standard order or organize by Delivery Partner (Valmo, Shadowfax, Ekart, Delhivery, Xpressbees) and Main SKU for lightning-fast warehouse packing.",
      tip: "Selecting SKU sorting automatically generates a consolidated CSV picklist for your packing staff.",
      badge: "Deterministic Courier & SKU Sorting",
    },
    {
      number: "3",
      title: "Instant 4×6 Thermal Crop & 1-Click Print",
      description:
        "Click 'Generate Labels'. LabelFlow isolates shipping labels from tax invoices and resizes them to standard 4 × 6 inch (288 × 432 pt) direct thermal vector pages. Barcodes and QR codes remain 100% vector-sharp with zero distortion.",
      tip: "Compatible with TVS, TSC, Zebra, Rollo, Munbyn, Xprinter, and all standard 4x6 thermal printers.",
      badge: "Zero Barcode Pixelation Guaranteed",
    },
  ];

  const faqs = [
    {
      q: "Does LabelFlow support multiple marketplaces?",
      a: "Yes! LabelFlow is engineered for Indian e-commerce. It features specialized vector cropping rules for Meesho, Flipkart (Ekart), Amazon Easy Ship, Myntra, and Snapdeal. Tax invoices are cleanly isolated so your thermal rolls only print shipping labels.",
    },
    {
      q: "Will invoice separation cut into my recipient address or courier barcode?",
      a: "Never. LabelFlow employs strict geometry rules and keyword verification safeguards. If a shipping label layout is ambiguous or recipient address text extends into the lower section, the entire page is preserved intact and flagged for review.",
    },
    {
      q: "What dimensions are the generated thermal labels?",
      a: "Standard 4 × 6 inches (100 × 150 mm, or exactly 288 × 432 points in PDF coordinate space). It uses PyMuPDF vector mapping to ensure barcodes, QR codes, and text remain crisp at 300+ DPI.",
    },
    {
      q: "How does SKU + Delivery partner sorting save time?",
      a: "Labels are grouped first by their extracted product SKU (e.g. all Brown T-shirts together), and within each SKU group they are organized by courier partner (Valmo, Shadowfax, Delhivery, etc.). Your packing team can pack 50 items at once without walking back and forth to racks.",
    },
    {
      q: "Do I need to install any software or extensions?",
      a: "No installation is required. LabelFlow runs completely in modern web browsers (Chrome, Edge, Safari, Firefox) on both desktop and mobile devices.",
    },
  ];

  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12 w-full flex-1">
        {/* Header */}
        <div className="space-y-2 text-center max-w-xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-neon/10 border border-cyan-neon/30 text-xs font-semibold text-cyan-neon">
            <span>Multi-Marketplace Guide</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
            How LabelFlow Works
          </h1>
          <p className="text-sm text-slate-300">
            From raw multi-page marketplace downloads to print-ready 4×6 thermal rolls in seconds.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {steps.map((s) => (
            <div
              key={s.number}
              className="p-6 rounded-2xl bg-navy-850/80 border border-navy-700/80 flex flex-col sm:flex-row items-start gap-4 shadow-card hover:border-cyan-neon/40 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-neon/20 to-purple-brand/20 border border-cyan-neon/40 text-cyan-neon font-extrabold text-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                {s.number}
              </div>
              <div className="space-y-2.5 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-white">{s.title}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-neon/10 text-cyan-neon border border-cyan-neon/20 font-mono">
                    {s.badge}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {s.description}
                </p>
                <div className="inline-block px-3 py-1 rounded-lg bg-navy-900 border border-navy-700/60 text-[11px] text-cyan-neon font-medium">
                  💡 Pro-tip: {s.tip}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Call to Action */}
        <div className="text-center pt-2">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold text-sm sm:text-base shadow-glow hover:brightness-110 active:scale-95 transition-all"
          >
            <span>Try It Now Free — Upload PDF</span>
          </Link>
        </div>

        {/* Frequently Asked Questions */}
        <div className="space-y-4 pt-6 border-t border-navy-700/60">
          <h2 className="text-xl font-bold text-white text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-navy-850/60 border border-navy-700/70 space-y-2"
              >
                <h4 className="text-sm font-bold text-white">{faq.q}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-navy-700/60 bg-navy-950/80 px-4 sm:px-8 py-5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-white">LabelFlow</span>
            <span>•</span>
            <span>Universal Marketplace 4×6 Cropper</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/blogs" className="hover:text-white transition-colors">Seller Guides</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
