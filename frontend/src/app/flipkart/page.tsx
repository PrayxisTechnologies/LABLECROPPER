import type { Metadata } from "next";
import CropLabelsPage from "@/components/CropLabelsPage";

export const metadata: Metadata = {
  title: "Flipkart Shipping Label Cropper — Crop 4×6 Thermal Labels & Ekart Barcodes",
  description:
    "Free online Flipkart shipping label cropper. Crop Flipkart logistics labels to 4x6 direct thermal printer format, isolate customer GST invoices, protect Ekart barcodes, and sort by Ekart, Shadowfax & Delhivery.",
  keywords: [
    "Flipkart label cropper",
    "Crop Flipkart label online",
    "Flipkart shipping label 4x6",
    "Ekart label cropper",
    "Flipkart thermal printer label",
    "Flipkart remove tax invoice",
    "Ekart logistics label crop 4x6",
  ],
  alternates: {
    canonical: "/flipkart-label-cropper",
  },
  openGraph: {
    title: "Flipkart Shipping Label Cropper — Crop 4×6 Thermal Labels & Ekart Barcodes",
    description:
      "Separate customer invoices and crop Flipkart labels to 4x6 thermal rolls with 100% Ekart barcode scannability.",
    type: "website",
    url: "/flipkart-label-cropper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flipkart Label Cropper — 4×6 Thermal Roll Labels",
    description:
      "Fast online Flipkart shipping label cropper for Ekart, Delhivery & Shadowfax dispatch.",
  },
};

export default function FlipkartCropperPage() {
  return (
    <CropLabelsPage
      platformName="Flipkart"
      platformTitle="Crop Flipkart Shipping Labels"
      platformSubtitle="Upload your Flipkart label PDF to crop 4×6 thermal rolls, organize by Ekart/Shadowfax/Delhivery, and manage SKUs."
    />
  );
}
