import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Amazon Shipping Label Cropper (Easy Ship 4×6 Thermal)",
  description:
    "Free online Amazon India shipping label cropper. Crop Amazon Easy Ship and Self-Ship PDFs to 4x6 thermal printer size, preserve tracking barcodes, and remove tax invoices.",
  keywords: [
    "Amazon label cropper",
    "Amazon easy ship label 4x6",
    "Crop Amazon shipping label",
    "Amazon thermal printer label",
  ],
};

export default function AmazonLabelCropperPage() {
  return (
    <CropLabelsPage
      platformName="Amazon"
      platformTitle="Crop Amazon Shipping Labels"
      platformSubtitle="Upload your Amazon Easy Ship or Self-Ship PDFs to automatically crop 4×6 thermal labels and organize by SKU."
    />
  );
}
