import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Snapdeal Shipping Label Cropper — Crop 4×6 Thermal Labels & Separate Invoices",
  description:
    "Free online Snapdeal shipping label cropper. Crop Snapdeal combined invoice-packslips to 4x6 direct thermal printer format, separate GST invoices, protect Delhivery & courier barcodes, and sort by courier partner.",
  keywords: [
    "Snapdeal label cropper",
    "Crop Snapdeal label online",
    "Snapdeal shipping label 4x6",
    "Snapdeal thermal printer label",
    "Snapdeal remove tax invoice",
    "Snapdeal packslip crop 4x6",
    "Snapdeal Delhivery label cropper",
  ],
  alternates: {
    canonical: "/snapdeal-label-cropper",
  },
  openGraph: {
    title: "Snapdeal Shipping Label Cropper — Crop 4×6 Thermal Labels & Separate Invoices",
    description:
      "Separate customer GST invoices and crop Snapdeal shipping packslips to 4x6 thermal rolls with 100% vector barcode fidelity.",
    type: "website",
    url: "/snapdeal-label-cropper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapdeal Label Cropper — 4×6 Thermal Roll Labels",
    description:
      "Fast online Snapdeal shipping label cropper for Delhivery, Shadowfax & Xpressbees dispatch.",
  },
};

export default function SnapdealLabelCropperPage() {
  return (
    <CropLabelsPage
      platformName="Snapdeal"
      platformTitle="Crop Snapdeal Shipping Labels"
      platformSubtitle="Upload your Snapdeal invoice-packslip PDF to crop 4×6 thermal rolls, remove customer GST invoices, organize by delivery partner, and manage SKUs."
    />
  );
}
