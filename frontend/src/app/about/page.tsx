import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "About Us — LabelFlow",
  description:
    "Learn about LabelFlow — the specialized shipping label formatting, 4x6 thermal cropping, and courier sorting platform for Indian e-commerce merchants.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-neon/10 border border-cyan-neon/30 text-xs font-semibold text-cyan-neon">
            <span>Our Mission</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white">
            About LabelFlow
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Empowering Indian online sellers with 1-click fulfillment automation, zero barcode distortion, and lightning-fast warehouse packing.
          </p>
        </div>

        <div className="space-y-6 text-sm text-slate-300 leading-relaxed bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-navy-700/60">
          <h2 className="text-xl font-bold text-white">Built by Sellers, for Sellers</h2>
          <p>
            LabelFlow was engineered to solve a daily headache faced by hundreds of thousands of Indian e-commerce sellers on Meesho, Flipkart, Amazon, and Snapdeal: <strong>spending hours manually resizing, screenshotting, cutting, and sorting bulk PDF shipping labels</strong>.
          </p>
          <p>
            Standard marketplace downloads give you mixed A4 PDFs with customer tax invoices stuck to the shipping labels. Printing them on modern direct thermal rolls (4×6 inches) squishes barcodes, wastes ink, and causes constant courier pickup rejections.
          </p>

          <h3 className="text-lg font-bold text-cyan-neon pt-2">Why LabelFlow is Different</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-navy-900 border border-navy-700 space-y-1.5">
              <h4 className="font-bold text-white text-sm">True Vector PyMuPDF Engine</h4>
              <p className="text-xs text-slate-400">Zero rasterization. Your barcodes and QR codes remain mathematically sharp at 300+ DPI.</p>
            </div>
            <div className="p-4 rounded-xl bg-navy-900 border border-navy-700 space-y-1.5">
              <h4 className="font-bold text-white text-sm">Automated Courier Separation</h4>
              <p className="text-xs text-slate-400">Instantly separates Valmo, Shadowfax, Ekart, and Delhivery orders into designated batches.</p>
            </div>
            <div className="p-4 rounded-xl bg-navy-900 border border-navy-700 space-y-1.5">
              <h4 className="font-bold text-white text-sm">Main SKU Assembly Line</h4>
              <p className="text-xs text-slate-400">Sorts parcels by color & item code so your team packs 50 pieces at once with zero mistakes.</p>
            </div>
            <div className="p-4 rounded-xl bg-navy-900 border border-navy-700 space-y-1.5">
              <h4 className="font-bold text-white text-sm">100% Free & Privacy Respecting</h4>
              <p className="text-xs text-slate-400">Files are processed in memory and never stored or sold.</p>
            </div>
          </div>
        </div>

        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold text-sm shadow-glow hover:brightness-110 transition-all"
          >
            <span>Start Cropping Labels Free</span>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
