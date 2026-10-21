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
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
            Privacy Policy
          </h1>
          <p className="text-xs text-slate-400">Last updated: October 21, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-slate-300 leading-relaxed bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-navy-700/60">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">1. Introduction</h2>
            <p>
              Welcome to LabelFlow (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). We respect your privacy and are committed to protecting the confidential information of our users. This Privacy Policy explains our practices regarding data processing, cookies, and third-party advertising partners when you access our shipping label cropping and sorting application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">2. Shipping Label PDF Data & Privacy Guarantee</h2>
            <p>
              LabelFlow provides an on-demand fulfillment processing tool. Any shipping label PDFs or manifests uploaded to our servers are:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-2">
              <li>Processed strictly in ephemeral volatile memory to generate 4×6 inch thermal vector pages.</li>
              <li>Never sold, shared, rented, or distributed to any third party.</li>
              <li>Purged automatically from temporary file storage buffers after processing completion.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">3. Google AdSense & Third-Party Advertising (DART Cookies)</h2>
            <p>
              We may display third-party advertisements served by <strong>Google AdSense</strong> to support free access to this service.
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-2">
              <li>Google, as a third-party vendor, uses cookies to serve ads on our site.</li>
              <li>Google&apos;s use of advertising cookies enables it and its partners to serve ads to our users based on their visit to our site and/or other sites on the Internet.</li>
              <li>
                Users may opt out of personalized advertising by visiting{" "}
                <a
                  href="https://www.google.com/settings/ads"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-neon underline hover:text-white"
                >
                  Google Ads Settings
                </a>.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">4. Cookies and Local Storage</h2>
            <p>
              We use browser LocalStorage strictly to store your non-sensitive user preferences (such as your chosen label sorting option, dark mode preference, and picklist toggles) so you do not have to reconfigure them each time you visit.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-white">5. Contact Information</h2>
            <p>
              If you have any questions or feedback regarding this Privacy Policy, please contact our administrative team at{" "}
              <Link href="/contact" className="text-cyan-neon underline hover:text-white">
                our Contact Page
              </Link>.
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
