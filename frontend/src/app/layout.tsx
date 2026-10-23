import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://labelcropper.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LabelFlow — Universal E-Commerce Shipping Label Cropper (4×6 Thermal)",
    template: "%s | LabelFlow Label Cropper",
  },
  description:
    "Free online shipping label cropper for Meesho, Flipkart, Amazon, Myntra, and Snapdeal. Crop PDF to 4x6 thermal printer size, remove tax invoice, sort by SKU & Courier partner (Valmo, Shadowfax, Ekart, Delhivery), and download print-ready PDF.",
  keywords: [
    "Meesho label cropper",
    "Flipkart label cropper",
    "Amazon shipping label cropper",
    "Myntra label cropper",
    "Snapdeal label cropper",
    "Free label cropper 4x6",
    "Thermal label generator",
    "Remove tax invoice",
    "Valmo label sorter",
    "Shadowfax label sorter",
    "Ekart label cropper",
    "SKU picklist generator",
    "Thermal 4x6 PDF crop",
  ],
  authors: [{ name: "Prayxis Software Solutions" }],
  creator: "Prayxis",
  publisher: "LabelFlow by Prayxis",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    title: "LabelFlow — Universal E-Commerce Shipping Label Cropper (4×6 Thermal)",
    description:
      "Instant 1-click shipping label cropping, courier sorting, and SKU picklist generation for thermal 4x6 printers across Meesho, Flipkart, Amazon, Myntra, and Snapdeal.",
    siteName: "LabelFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelFlow — Universal E-Commerce Shipping Label Cropper (4×6 Thermal)",
    description:
      "Crop PDFs to 4x6 thermal labels, remove tax invoices, and group by courier & SKU instantly.",
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "LabelFlow",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    description:
      "Online shipping label cropper and optimizer for Meesho, Flipkart, Amazon, Myntra, and Snapdeal sellers. Automatically crops PDF pages to 4x6 thermal printer format, isolates tax invoices, and organizes labels by SKU and delivery partner.",
    featureList: [
      "1-Click 4x6 Thermal Label Cropping",
      "Automated Tax Invoice Removal",
      "Courier Sorting (Valmo, Shadowfax, Xpressbees, Ekart, Delhivery)",
      "Main SKU Grouping & Disambiguation",
      "Warehouse Picklist CSV Generation",
      "In-Browser PDF Viewer & Direct Printing",
    ],
  };

  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (stored === 'dark' || (!stored && prefersDark)) {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        }
      } catch (e) {
        document.documentElement.classList.add('dark');
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen selection:bg-cyan-neon selection:text-navy-950 antialiased bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white transition-colors duration-200">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
