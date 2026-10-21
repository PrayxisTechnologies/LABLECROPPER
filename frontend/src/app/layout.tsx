import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://labelcropper.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LabelFlow — Meesho Shipping Label Cropper (4×6 Thermal)",
    template: "%s | LabelFlow Label Cropper",
  },
  description:
    "Free online Meesho shipping label cropper. Crop Meesho PDF to 4x6 thermal printer size, remove tax invoice, sort by SKU & Courier partner (Valmo, Shadowfax, Xpressbees), and download print-ready PDF.",
  keywords: [
    "Meesho label cropper",
    "Meesho shipping label crop",
    "Free label cropper 4x6",
    "Meesho thermal label generator",
    "Crop Meesho PDF online",
    "Meesho label crop software",
    "Remove tax invoice Meesho label",
    "Valmo label sorter",
    "Shadowfax label sorter",
    "Flipkart label cropper",
    "Amazon shipping label cropper",
    "E-cropper alternative",
    "SKU picklist generator Meesho",
    "Thermal 4x6 PDF crop",
  ],
  authors: [{ name: "LabelFlow Team" }],
  creator: "LabelFlow",
  publisher: "LabelFlow",
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
    title: "LabelFlow — Free Meesho Shipping Label Cropper (4×6 Thermal)",
    description:
      "Instant 1-click Meesho shipping label cropping, courier sorting (Valmo, Shadowfax), and SKU picklist generation for thermal 4x6 printers.",
    siteName: "LabelFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelFlow — Free Meesho Shipping Label Cropper (4×6 Thermal)",
    description:
      "Crop Meesho PDFs to 4x6 thermal labels, remove tax invoices, and group by courier & SKU instantly.",
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
      "Online shipping label cropper and optimizer for Meesho, Flipkart, and Amazon sellers. Automatically crops PDF pages to 4x6 thermal printer format, isolates tax invoices, and organizes labels by SKU and delivery partner.",
    featureList: [
      "1-Click 4x6 Thermal Label Cropping",
      "Automated Tax Invoice Removal",
      "Courier Sorting (Valmo, Shadowfax, Xpressbees)",
      "Main SKU Grouping (Brown, Green, etc.)",
      "Warehouse Picklist CSV Generation",
      "In-Browser PDF Viewer & Direct Printing",
    ],
  };

  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-navy-900 text-white min-h-screen selection:bg-cyan-neon selection:text-navy-950 antialiased">
        {children}
      </body>
    </html>
  );
}
