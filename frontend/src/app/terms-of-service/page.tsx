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
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Terms of Service
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Effective Date: October 2026</p>
        </div>

        <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-navy-700/60 shadow-sm dark:shadow-none transition-colors">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">1. Agreement to Terms</h2>
            <p>
              By accessing or using LabelFlow by Prayxis, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must refrain from using the application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">2. Nature of Service & Disclaimers</h2>
            <p>
              LabelFlow is an independent automated productivity tool intended to assist e-commerce sellers in resizing and formatting shipping documents for direct thermal roll printers.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>LabelFlow is an independent utility and is <strong>not affiliated, endorsed, or sponsored by Meesho, Flipkart, Amazon, Myntra, or Snapdeal</strong>.</li>
              <li>Marketplace names and logos are trademarks of their respective legal holders.</li>
              <li>While every effort is made to guarantee barcode precision and format fidelity, users remain responsible for verifying label scannability prior to courier dispatch.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">3. Acceptable Use</h2>
            <p>
              You agree not to upload malicious scripts, corrupted files, or exploit the platform via denial-of-service attacks or automated web scrapers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">4. Governing Law</h2>
            <p>
              These Terms shall be governed by and interpreted in accordance with the laws of India.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-navy-700/60 bg-white/80 dark:bg-navy-950/80 px-4 sm:px-8 py-5 transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>&copy; {new Date().getFullYear()} LabelFlow by Prayxis. All rights reserved.</span>
          <Link href="/" className="hover:text-cyan-600 dark:hover:text-cyan-neon transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  );
}
