import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://labelcropper.prayxis.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LabelCropper — #1 Free Meesho & Flipkart Shipping Label Cropper (4×6 Thermal)",
    template: "%s | LabelCropper by Prayxis",
  },
  description:
    "India's #1 free online shipping label cropper for Meesho, Flipkart, Amazon, and Myntra sellers. 1-click crop A4 PDF to 4x6 thermal roll size, remove customer tax invoices, sort by Valmo, Shadowfax & Ekart, and print with 100% crisp barcodes.",
  keywords: [
    "Meesho label cropper",
    "Flipkart label cropper",
    "Label cropper",
    "Shipping label cropper",
    "Meesho shipping label crop 4x6",
    "Crop Meesho label online free",
    "Flipkart shipping label crop online",
    "Ekart label cropper",
    "Amazon shipping label cropper",
    "Free label cropper 4x6",
    "Thermal label generator",
    "Remove tax invoice Meesho",
    "Valmo courier label sorter",
    "Shadowfax Meesho label",
    "Ekart logistics label crop",
    "SKU picklist generator",
    "Thermal 4x6 PDF crop",
  ],
  authors: [{ name: "Prayxis Technologies" }],
  creator: "Prayxis",
  publisher: "Prayxis Technologies",
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
    title: "LabelCropper — Free Meesho, Flipkart & Amazon Shipping Label Cropper (4×6 Thermal)",
    description:
      "Instant 1-click vector shipping label cropping, tax invoice removal, Valmo/Shadowfax/Ekart courier sorting, and SKU picklists for 4x6 thermal printers.",
    siteName: "LabelCropper",
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelCropper — #1 Free Shipping Label Cropper for Indian E-Commerce",
    description:
      "Crop Meesho & Flipkart PDFs to 4x6 thermal labels, remove tax invoices, and group by courier & SKU instantly.",
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
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "LabelCropper",
        alternateName: "LabelFlow",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web Browser, Windows, macOS, Android, iOS",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.9",
          ratingCount: "1480",
          bestRating: "5",
          worstRating: "1",
        },
        description:
          "High-speed online shipping label cropper and optimizer for Meesho, Flipkart, Amazon, and Myntra sellers. Automatically crops PDF pages to 4x6 thermal printer format, isolates tax invoices, and organizes labels by SKU and delivery partner (Valmo, Ekart, Shadowfax, Delhivery).",
        featureList: [
          "1-Click 4x6 Thermal Label Cropping",
          "Automated Tax Invoice Removal",
          "Courier Sorting (Valmo, Shadowfax, Xpressbees, Ekart, Delhivery)",
          "Main SKU Grouping & Disambiguation",
          "Warehouse Picklist CSV Generation",
          "In-Browser PDF Viewer & Direct Printing",
        ],
      },
      {
        "@type": "Organization",
        name: "Prayxis Technologies",
        url: siteUrl,
        logo: `${siteUrl}/favicon.ico`,
        contactPoint: {
          "@type": "ContactPoint",
          email: "info@prayxis.in",
          contactType: "customer support",
          areaServed: "IN",
          availableLanguage: ["English", "Hindi"],
        },
      },
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
