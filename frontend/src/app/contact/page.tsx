import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Contact Us — LabelFlow Support",
  description:
    "Get in touch with the LabelFlow support team. Inquiries, feedback, and assistance for e-commerce label cropping and printer integration.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-xs font-semibold text-cyan-600 dark:text-cyan-neon">
            <span>Support & Inquiries</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Contact LabelFlow
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Have questions, feedback, or a partnership inquiry? Prayxis Software Solutions is here to help.
          </p>
        </div>

        <div className="bg-white dark:bg-navy-850/70 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-navy-700/70 shadow-sm dark:shadow-none space-y-6 transition-colors">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold text-cyan-600 dark:text-cyan-neon tracking-wider">
              Email Support
            </span>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              info@prayxis.in
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              We usually reply within 24 business hours.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-navy-700/60 space-y-2">
            <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Feedback & Feature Requests
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Want us to add support for another marketplace or courier format? Send us a sample PDF file via email, and our engineering team will build custom crop rules for you!
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-navy-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Operational Hours: Mon – Sat, 9:00 AM – 7:00 PM IST</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
