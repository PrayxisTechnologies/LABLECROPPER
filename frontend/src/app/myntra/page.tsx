import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Myntra Shipping Label Cropper (4×6 Thermal Format)",
  description:
    "Free online Myntra shipping label cropper. Crop Myntra logistics labels to 4x6 thermal printer size, preserve fashion SKU barcodes, and generate picklists.",
  keywords: [
    "Myntra label cropper",
    "Myntra shipping label 4x6",
    "Crop Myntra PDF label",
  ],
};

export default function MyntraCropperPage() {
  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-8 flex-1 flex flex-col justify-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-pink-500/15 border border-pink-400/40 text-pink-300 text-xs font-semibold mx-auto">
          <span className="w-2 h-2 rounded-full bg-pink-400 animate-ping" />
          <span>Myntra Fashion Logistics • Coming Soon</span>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Myntra Shipping Label Cropper
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Format your Myntra fashion order labels to 4×6 direct thermal rolls with SKU barcode integrity. Coming soon!
          </p>
        </div>

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
