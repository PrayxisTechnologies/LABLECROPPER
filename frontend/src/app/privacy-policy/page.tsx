import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Privacy Policy — LabelFlow",
  description:
    "LabelFlow Privacy Policy. Learn how we handle client data, cookies, Google AdSense third-party advertising, and privacy protections.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Privacy Policy
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Last updated: October 2026</p>
        </div>

        <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-navy-700/60 shadow-sm dark:shadow-none transition-colors">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">1. Introduction</h2>
            <p>
              Welcome to LabelFlow by Prayxis (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). We respect your privacy and are committed to protecting the confidential information of our users. This Privacy Policy explains our practices regarding data processing, cookies, and privacy when you access our shipping label cropping and sorting application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">2. Shipping Label PDF Data & Privacy Guarantee</h2>
            <p>
              LabelFlow provides an on-demand fulfillment processing tool. Any shipping label PDFs or manifests uploaded to our servers are:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Processed strictly in ephemeral volatile memory to generate 4×6 inch thermal vector pages.</li>
              <li>Never sold, shared, rented, or distributed to any third party.</li>
              <li>Purged automatically from temporary file storage buffers after processing completion.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">3. Cookies and Local Storage</h2>
            <p>
              We use browser LocalStorage strictly to store your non-sensitive user preferences (such as your chosen label sorting option, dark / bright mode theme preference, and picklist toggles) so you do not have to reconfigure them each time you visit.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">4. Contact Information</h2>
            <p>
              If you have any questions or feedback regarding this Privacy Policy, please contact our team via{" "}
              <Link href="/contact" className="text-cyan-600 dark:text-cyan-neon underline hover:text-cyan-700 dark:hover:text-white">
                our Contact Page
              </Link>.
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
