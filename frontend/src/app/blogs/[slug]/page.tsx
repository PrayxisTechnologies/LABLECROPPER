import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BLOG_POSTS } from "@/lib/blogs";

interface Props {
  params: {
    slug: string;
  };
}

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = BLOG_POSTS.find((p) => p.slug === params.slug);
  if (!post) {
    return { title: "Blog Post Not Found — LabelFlow" };
  }

  return {
    title: `${post.title} — LabelFlow Guide`,
    description: post.excerpt,
    keywords: post.keywords,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default function BlogPostPage({ params }: Props) {
  const post = BLOG_POSTS.find((p) => p.slug === params.slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 w-full flex-1">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-cyan-600 dark:hover:text-cyan-neon transition-colors">Home</Link>
          <span>/</span>
          <Link href="/blogs" className="hover:text-cyan-600 dark:hover:text-cyan-neon transition-colors">Blogs</Link>
          <span>/</span>
          <span className="text-slate-800 dark:text-slate-200 truncate">{post.title}</span>
        </nav>

        {/* Article Header */}
        <header className="space-y-4 border-b border-slate-200 dark:border-navy-700/60 pb-6">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="px-2.5 py-1 rounded-md bg-cyan-50 dark:bg-cyan-neon/15 text-cyan-600 dark:text-cyan-neon border border-cyan-200 dark:border-cyan-neon/30 font-semibold">
              {post.category}
            </span>
            <span>•</span>
            <span>{post.readTime}</span>
            <span>•</span>
            <span>Published on {post.date}</span>
            <span>•</span>
            <span>By {post.author}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white leading-tight">
            {post.title}
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed italic bg-white dark:bg-navy-850/60 p-4 rounded-xl border border-slate-200 dark:border-navy-700/50 shadow-sm dark:shadow-none">
            {post.excerpt}
          </p>
        </header>

        {/* Article Body */}
        <article className="max-w-none space-y-6 text-slate-700 dark:text-slate-200 text-sm sm:text-base leading-relaxed">
          {post.content.split("\n\n").map((block, i) => {
            const trimmed = block.trim();
            if (!trimmed) return null;

            if (trimmed.startsWith("## ")) {
              return (
                <h2 key={i} className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white pt-4 pb-1 border-b border-slate-200 dark:border-navy-800">
                  {trimmed.replace("## ", "")}
                </h2>
              );
            }
            if (trimmed.startsWith("### ")) {
              return (
                <h3 key={i} className="text-lg sm:text-xl font-bold text-cyan-600 dark:text-cyan-neon pt-3 pb-1">
                  {trimmed.replace("### ", "")}
                </h3>
              );
            }
            if (trimmed.startsWith("---")) {
              return <hr key={i} className="border-slate-200 dark:border-navy-700/60 my-6" />;
            }
            if (trimmed.startsWith("- ")) {
              const items = trimmed.split("\n").filter((l) => l.startsWith("- "));
              return (
                <ul key={i} className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 pl-2">
                  {items.map((it, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {it.replace(/^- \*\*(.*?)\*\*:?/, "").length > 0 ? (
                        <>
                          <strong className="text-slate-900 dark:text-white">
                            {it.match(/^- \*\*(.*?)\*\*/)?.[1] || ""}
                          </strong>
                          {it.replace(/^- \*\*(.*?)\*\*/, "")}
                        </>
                      ) : (
                        it.replace(/^- /, "")
                      )}
                    </li>
                  ))}
                </ul>
              );
            }
            if (trimmed.startsWith("1. ")) {
              const items = trimmed.split("\n").filter((l) => /^\d+\. /.test(l));
              return (
                <ol key={i} className="list-decimal list-inside space-y-2 text-slate-600 dark:text-slate-300 pl-2">
                  {items.map((it, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {it.replace(/^\d+\. /, "")}
                    </li>
                  ))}
                </ol>
              );
            }

            return (
              <p key={i} className="leading-relaxed text-slate-600 dark:text-slate-300">
                {trimmed}
              </p>
            );
          })}
        </article>

        {/* CTA Bar */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-50 via-purple-50 to-white dark:from-cyan-neon/10 dark:via-purple-brand/10 dark:to-navy-850 border border-cyan-200 dark:border-cyan-neon/30 flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 shadow-sm dark:shadow-none">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-base">Ready to crop your shipping labels?</h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">Crop, sort, and print your 4×6 thermal labels in 1 click for free.</p>
          </div>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold text-sm shadow-glow hover:brightness-110 transition-all flex-shrink-0"
          >
            Launch Label Cropper
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
