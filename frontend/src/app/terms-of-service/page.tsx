import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Terms of Service — LabelFlow",
  description:
    "Terms of Service governing the use of LabelFlow shipping label cropping, courier sorting, and fulfillment tools.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
            Terms of Service
          </h1>
          <p className="text-xs text-slate-400">Effective Date: October 21, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-slate-300 leading-relaxed bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-navy-700/60">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">1. Agreement to Terms</h2>
            <p>
              By accessing or using LabelFlow, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must refrain from using the application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">2. Nature of Service & Disclaimers</h2>
            <p>
              LabelFlow is an independent automated productivity tool intended to assist e-commerce sellers in resizing and formatting shipping documents for direct thermal roll printers.
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-2">
              <li>LabelFlow is an independent utility and is <strong>not affiliated, endorsed, or sponsored by Meesho, Flipkart, Amazon, Myntra, or Snapdeal</strong>.</li>
              <li>Marketplace names and logos are trademarks of their respective legal holders.</li>
              <li>While every effort is made to guarantee barcode precision and format fidelity, users remain solely responsible for verifying label scannability prior to courier dispatch.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">3. Acceptable Use</h2>
            <p>
              You agree not to upload malicious scripts, corrupted files, or exploit the platform via denial-of-service attacks or automated web scrapers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">4. Modifications to Terms</h2>
            <p>
              We reserve the right to revise or update these terms at any time. Continued use of the platform constitutes your agreement to such modifications.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-navy-700/60 bg-navy-950/80 px-4 sm:px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-slate-400">
          <span>&copy; {new Date().getFullYear()} LabelFlow. All rights reserved.</span>
          <Link href="/" className="hover:text-cyan-neon transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  );
}
