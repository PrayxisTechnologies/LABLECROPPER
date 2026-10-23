import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { BLOG_POSTS } from "@/lib/blogs";

export const metadata: Metadata = {
  title: "E-Commerce Shipping & Label Printing Guides — LabelFlow Blog",
  description:
    "Comprehensive guides, tutorials, and printer reviews for Meesho, Flipkart, and Amazon sellers in India. Learn 4x6 label cropping, thermal printer setup, and warehouse logistics optimization.",
  keywords: [
    "meesho label cropping guide",
    "best thermal printers india",
    "flipkart shipping label size",
    "valmo courier sorting",
    "ecommerce warehouse fulfillment tips",
  ],
};

export default function BlogsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10 w-full flex-1">
        {/* Header Banner */}
        <div className="space-y-3 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-xs font-semibold text-cyan-600 dark:text-cyan-neon">
            <span>Seller Knowledge Base & Guides</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            E-Commerce Fulfillment & Labeling Guides
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Master thermal label printing, multi-courier sorting, and order packaging optimization for Meesho, Flipkart, and Amazon sellers.
          </p>
        </div>

        {/* Featured Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {BLOG_POSTS.map((post) => (
            <article
              key={post.slug}
              className="p-6 rounded-2xl bg-white dark:bg-navy-850/80 border border-slate-200 dark:border-navy-700/80 hover:border-cyan-500/50 dark:hover:border-cyan-neon/50 transition-all shadow-sm dark:shadow-card flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="px-2.5 py-1 rounded-md bg-cyan-50 dark:bg-cyan-neon/10 text-cyan-600 dark:text-cyan-neon border border-cyan-200 dark:border-cyan-neon/20 font-semibold">
                    {post.category}
                  </span>
                  <span>{post.readTime}</span>
                </div>

                <h2 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-neon transition-colors leading-snug">
                  <Link href={`/blogs/${post.slug}`}>{post.title}</Link>
                </h2>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                  {post.excerpt}
                </p>
              </div>

              <div className="pt-5 mt-5 border-t border-slate-100 dark:border-navy-700/60 flex items-center justify-between">
                <span className="text-xs text-slate-400">{post.date}</span>
                <Link
                  href={`/blogs/${post.slug}`}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-cyan-600 dark:text-cyan-neon hover:text-cyan-700 dark:hover:text-white transition-colors"
                >
                  <span>Read Full Article</span>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-navy-700/60 bg-white/80 dark:bg-navy-950/80 px-4 sm:px-8 py-5 transition-colors">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-800 dark:text-white">LabelFlow</span>
            <span>•</span>
            <span>Shipping Label Cropping & Sorting Resource Hub by Prayxis</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-cyan-600 dark:hover:text-white transition-colors">Home</Link>
            <Link href="/privacy-policy" className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-slate-900 dark:hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
