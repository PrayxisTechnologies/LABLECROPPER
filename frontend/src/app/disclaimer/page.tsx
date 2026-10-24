import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Disclaimer & Trademark Notice — LabelCropper",
  description:
    "Official non-affiliation notice, trademark disclaimer, and fair use statement for LabelCropper (by Prayxis Technologies).",
  robots: {
    index: true,
    follow: true,
  },
};

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        <div className="space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <span>Legal Notice & Transparency</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Disclaimer & Trademark Notice
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last Updated: October 2026 • Prayxis Technologies
          </p>
        </div>

        <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-navy-850/60 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-navy-700/60 shadow-sm dark:shadow-none transition-colors">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              1. Non-Affiliation Statement
            </h2>
            <p>
              <strong>LabelCropper</strong> (also known as LabelFlow) is an independent utility software developed, operated, and maintained by <strong>Prayxis Technologies</strong>.
            </p>
            <p>
              LabelCropper is <strong>NOT</strong> affiliated, associated, authorized, endorsed by, or in any way officially connected with:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 font-medium text-slate-700 dark:text-slate-200">
              <li>Meesho (Fashnear Technologies Private Limited)</li>
              <li>Flipkart (Flipkart Internet Private Limited) / Ekart Logistics</li>
              <li>Amazon (Amazon Seller Services Private Limited)</li>
              <li>Myntra Designs Private Limited</li>
              <li>Snapdeal Private Limited</li>
              <li>Or any of their respective parent companies, subsidiaries, or affiliates.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              2. Trademark Fair Use Notice
            </h2>
            <p>
              The names &ldquo;Meesho&rdquo;, &ldquo;Flipkart&rdquo;, &ldquo;Amazon&rdquo;, &ldquo;Myntra&rdquo;, &ldquo;Snapdeal&rdquo;, &ldquo;Ekart&rdquo;, &ldquo;Shadowfax&rdquo;, &ldquo;Delhivery&rdquo;, &ldquo;Valmo&rdquo;, &ldquo;Xpressbees&rdquo;, and any associated brand logos are registered trademarks of their respective legal entities.
            </p>
            <p>
              Any reference to these names or marks on this website is made <strong>strictly for nominative and descriptive purposes</strong> to indicate compatibility of our PDF cropping tools with standard PDF export formats provided by those marketplaces to their registered merchants.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              3. Data Security & Document Confidentiality
            </h2>
            <p>
              We treat merchant shipping documents with strict confidentiality:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>All uploaded PDF files are processed purely in temporary memory for mathematical vector page transformation.</li>
              <li>We do not store, archive, sell, or share customer addresses, order values, or invoice contents.</li>
              <li>Temporary file buffers are purged automatically after generation.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              4. Merchant Verification Responsibility
            </h2>
            <p>
              While LabelCropper uses precision vector algorithms to maintain 100% barcode clarity and dimension accuracy (standard 4×6 inch / 100×150 mm), users are strongly advised to perform a sample test scan on their thermal printer prior to printing large batches for courier dispatch.
            </p>
          </section>

          <section className="space-y-2 pt-4 border-t border-slate-200 dark:border-navy-700/60">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              5. Contact Information
            </h2>
            <p>
              For any legal inquiries, trademark concerns, or feedback, please contact our administrative team at:
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
