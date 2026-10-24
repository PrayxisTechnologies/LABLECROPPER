import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — LabelCropper",
  description:
    "LabelCropper Privacy Policy. Detailed disclosures on PDF data processing, cookies, Google AdSense third-party advertising, and privacy protections.",
  robots: {
    index: true,
    follow: true,
  },
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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last updated: October 2026 • Prayxis Technologies
          </p>
        </div>

        <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-navy-700/60 shadow-sm dark:shadow-none transition-colors">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">1. Introduction</h2>
            <p>
              Welcome to <strong>LabelCropper</strong> (by Prayxis Technologies, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). We respect your privacy and are committed to protecting the confidential business information of our users. This Privacy Policy outlines our strict data handling practices, cookies usage, and third-party advertising transparency when you use our shipping label cropping and sorting tools.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">2. Shipping Label PDF Data & Privacy Guarantee</h2>
            <p>
              LabelCropper provides an on-demand browser fulfillment tool. Any shipping label PDFs or manifests uploaded to our servers are:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium text-slate-700 dark:text-slate-200">
              <li>Processed strictly in ephemeral volatile memory to generate 4×6 inch thermal vector pages.</li>
              <li>Never sold, shared, rented, or distributed to any third party or marketing database.</li>
              <li>Purged automatically from temporary file storage buffers immediately after processing completion.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">3. Cookies, LocalStorage and Web Beacons</h2>
            <p>
              We use browser LocalStorage strictly to store non-sensitive user preferences (such as your chosen label sorting option, dark/bright mode theme preference, and picklist toggles) so you do not have to reconfigure them each time you visit.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">4. Google AdSense and Third-Party Advertising (Doubleclick Cookie)</h2>
            <p>
              We may partner with third-party advertising networks, such as <strong>Google AdSense</strong>, to display advertisements when you visit our website.
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2">
              <li>Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s prior visits to this website or other websites on the internet.</li>
              <li>Google&apos;s use of advertising cookies enables it and its partners to serve ads to users based on their visit to our site and/or other sites on the Internet.</li>
              <li>Users may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 underline">Google Ads Settings</a> or through <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 underline">www.aboutads.info</a>.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">5. Log Files & Analytics</h2>
            <p>
              Like many websites, LabelCropper makes use of standard server log files. The information inside the log files includes internet protocol (IP) addresses, type of browser, Internet Service Provider (ISP), date/time stamp, referring/exit pages, and number of clicks to analyze trends and administer the site. None of this information is linked to personally identifiable information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">6. Children&apos;s Privacy</h2>
            <p>
              LabelCropper does not knowingly collect any Personal Identifiable Information from children under the age of 13. Our application is intended for adult business merchants and e-commerce operators.
            </p>
          </section>

          <section className="space-y-2 pt-4 border-t border-slate-200 dark:border-navy-700/60">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">7. Contact Information</h2>
            <p>
              If you have any questions or feedback regarding this Privacy Policy, please contact our data compliance officer at:
            </p>
            <p className="font-semibold text-cyan-600 dark:text-cyan-400">
              Email: info@prayxis.in
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
