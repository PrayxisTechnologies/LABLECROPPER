import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Amazon Shipping Label Cropper (Easy Ship 4×6 Thermal)",
  description:
    "Free online Amazon India shipping label cropper. Crop Amazon Easy Ship and Self-Ship PDFs to 4x6 thermal printer size, preserve tracking barcodes, and remove tax invoices.",
  keywords: [
    "Amazon label cropper",
    "Amazon easy ship label 4x6",
    "Crop Amazon shipping label",
    "Amazon thermal printer label",
  ],
};

export default function AmazonCropperPage() {
  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-8 flex-1 flex flex-col justify-center">
        {/* Badge */}
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-semibold mx-auto">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Amazon Easy Ship Engine • Coming Soon</span>
        </div>

        {/* Headline */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Amazon Shipping Label Cropper
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Crop Amazon Easy Ship & FBA labels to crisp 4×6 thermal rolls with zero wasted white margins. Launching soon!
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-3xl mx-auto w-full pt-4">
          <div className="p-4 rounded-xl bg-navy-950/80 border border-navy-700/80 space-y-2">
            <span className="text-xl">📦</span>
            <h3 className="font-bold text-white text-sm">Easy Ship Format</h3>
            <p className="text-xs text-slate-400">Fits Amazon Easy Ship 4x6 labels without manual scaling or clipping.</p>
          </div>
          <div className="p-4 rounded-xl bg-navy-950/80 border border-navy-700/80 space-y-2">
            <span className="text-xl">⚡</span>
            <h3 className="font-bold text-white text-sm">Crisp Barcodes</h3>
            <p className="text-xs text-slate-400">100% vector rendering for instant barcode & QR scanner pickup.</p>
          </div>
          <div className="p-4 rounded-xl bg-navy-950/80 border border-navy-700/80 space-y-2">
            <span className="text-xl">📄</span>
            <h3 className="font-bold text-white text-sm">Invoice Separation</h3>
            <p className="text-xs text-slate-400">Keeps shipping labels on thermal and routes tax invoices to separate sheets.</p>
          </div>
        </div>

        {/* Call to action */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/crop-labels"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 hover:brightness-110 active:scale-95 transition-all shadow-glow"
          >
            Try Meesho Label Cropper (Live Now) ➔
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-medium text-xs text-slate-300 hover:text-white bg-navy-800/80 hover:bg-navy-800 border border-navy-700 transition-all"
          >
            Back to Home
          </Link>
        </div>
      </main>

      <footer className="border-t border-navy-700/60 bg-navy-950/80 px-4 sm:px-8 py-5 text-xs text-slate-400 text-center">
        <span>LabelFlow • Multi-Marketplace Shipping Label Optimizer</span>
      </footer>
    </div>
  );
}
