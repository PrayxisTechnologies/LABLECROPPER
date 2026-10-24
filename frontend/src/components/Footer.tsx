import React from "react";
import Link from "next/link";

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 dark:border-navy-700/60 bg-white dark:bg-[#07111F] text-slate-600 dark:text-slate-300 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">
          
          {/* Col 1 & 2: Brand & Mission */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center space-x-3 group inline-block">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-md">
                L
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  Label<span className="text-cyan-500">Cropper</span>
                </span>
                <span className="text-[10px] tracking-wider uppercase font-semibold text-slate-500 dark:text-slate-400">
                  By Prayxis Technologies
                </span>
              </div>
            </Link>
            
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
              India&apos;s #1 high-speed vector shipping label cropper for Meesho, Flipkart, Amazon, and Myntra sellers. 
              Crop A4 manifests to 4×6 direct thermal roll labels, remove tax invoices, and sort by SKU & courier partner in 1 click.
            </p>

            <div className="flex items-center space-x-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 font-medium text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                100% Free Tool
              </span>
              <span>•</span>
              <span>Zero Barcode Distortion</span>
              <span>•</span>
              <span>300+ DPI Crisp</span>
            </div>
          </div>

          {/* Col 3: Dedicated Tools */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              E-Commerce Croppers
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link
                  href="/meesho-label-cropper"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Meesho Label Cropper
                </Link>
              </li>
              <li>
                <Link
                  href="/flipkart-label-cropper"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Flipkart Label Cropper
                </Link>
              </li>
              <li>
                <Link
                  href="/amazon"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Amazon Shipping Label Cropper
                </Link>
              </li>
              <li>
                <Link
                  href="/myntra"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Myntra Label Cropper
                </Link>
              </li>
              <li>
                <Link
                  href="/snapdeal"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Snapdeal Label Cropper
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/skus"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  SKU Picklist Generator
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Seller Knowledge & Guides */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Seller Guides & Tutorials
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link
                  href="/blogs/how-to-crop-meesho-shipping-labels-4x6-thermal-printer"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors line-clamp-1"
                >
                  How to Crop Meesho Labels (4×6)
                </Link>
              </li>
              <li>
                <Link
                  href="/blogs/meesho-label-cropper-online-free-tool-guide-2026"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors line-clamp-1"
                >
                  Meesho Supplier Cropper Guide (2026)
                </Link>
              </li>
              <li>
                <Link
                  href="/blogs/flipkart-shipping-label-cropper-ekart-guide"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors line-clamp-1"
                >
                  Flipkart Ekart Barcode Guide
                </Link>
              </li>
              <li>
                <Link
                  href="/blogs/best-thermal-printers-for-ecommerce-sellers-in-india"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors line-clamp-1"
                >
                  Best Thermal Printers in India
                </Link>
              </li>
              <li>
                <Link
                  href="/blogs/how-sku-courier-sorting-saves-time-in-warehouse"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors line-clamp-1"
                >
                  SKU & Courier Sorting Guide
                </Link>
              </li>
              <li>
                <Link
                  href="/blogs"
                  className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                >
                  View All Guides →
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 5: Legal & Trust (Essential for Google Ads / AdSense) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Trust & Compliance
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link
                  href="/about"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  About Us (Prayxis)
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Contact Support
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy-policy"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-of-service"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/disclaimer"
                  className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors font-medium text-amber-600 dark:text-amber-400"
                >
                  Non-Affiliation Disclaimer
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Legal Disclaimer Box - Required for Google Ads & AdSense Trademark Compliance */}
        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-navy-700/60">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            <p>
              <strong className="text-slate-700 dark:text-slate-300">Trademark & Non-Affiliation Disclaimer:</strong>{" "}
              LabelCropper (LabelFlow) is an independent utility software created by Prayxis Technologies. 
              All product names, logos, brands, and registered trademarks (including Meesho, Flipkart, Amazon, Myntra, Snapdeal, Ekart, Shadowfax, Delhivery, Valmo, and Xpressbees) are the property of their respective owners. 
              Reference to these marks is strictly for identification, descriptive, and compatibility purposes under Indian fair use principles and does not imply any affiliation, sponsorship, or endorsement by the trademark holders.
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div>
              © {new Date().getFullYear()} Prayxis Technologies. All rights reserved.
            </div>
            <div className="flex items-center space-x-4">
              <span>Support: info@prayxis.in</span>
              <span>•</span>
              <span>Made with ❤️ for Indian E-Commerce Sellers</span>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
};
