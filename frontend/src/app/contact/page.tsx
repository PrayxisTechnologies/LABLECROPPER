import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Contact Us — LabelFlow Support",
  description:
    "Get in touch with the LabelFlow support team. Inquiries, feedback, and assistance for e-commerce label cropping and printer integration.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-neon/10 border border-cyan-neon/30 text-xs font-semibold text-cyan-neon">
            <span>Support & Inquiries</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
            Contact LabelFlow
          </h1>
          <p className="text-sm text-slate-300">
            Have questions, feedback, or a partnership inquiry? We are here to help.
          </p>
        </div>

        <div className="bg-navy-850/70 p-6 sm:p-8 rounded-2xl border border-navy-700/70 space-y-6">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold text-cyan-neon tracking-wider">
              Email Support
            </span>
            <p className="text-base font-semibold text-white">
              support@labelcropper.in
            </p>
            <p className="text-xs text-slate-400">
              We usually reply within 24 business hours.
            </p>
          </div>

          <div className="pt-4 border-t border-navy-700/60 space-y-2">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
              Feedback & Feature Requests
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              Want us to add support for another marketplace or courier format? Send us a sample PDF file via email, and our engineering team will build custom crop rules for you!
            </p>
          </div>

          <div className="pt-4 border-t border-navy-700/60 flex items-center justify-between text-xs text-slate-400">
            <span>Operational Hours: Mon – Sat, 9:00 AM – 7:00 PM IST</span>
          </div>
        </div>
      </main>

      <footer className="border-t border-navy-700/60 bg-navy-950/80 px-4 sm:px-8 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between text-xs text-slate-400">
          <span>&copy; {new Date().getFullYear()} LabelFlow.</span>
          <Link href="/" className="hover:text-cyan-neon transition-colors">Back to Cropper</Link>
        </div>
      </footer>
    </div>
  );
}
