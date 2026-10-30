import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Myntra Shipping Label Cropper (4×6 Thermal Format)",
  description:
    "Free online Myntra shipping label cropper. Crop Myntra logistics labels to 4x6 thermal printer size, preserve fashion SKU barcodes, and generate picklists.",
  keywords: [
    "Myntra label cropper",
    "Myntra shipping label 4x6",
    "Crop Myntra PDF label",
  ],
};

export default function MyntraLabelCropperPage() {
  return (
    <CropLabelsPage
      platformName="Myntra"
      platformTitle="Crop Myntra Logistics Labels"
      platformSubtitle="Upload Myntra shipping PDFs to format 4×6 thermal labels with SKU barcode preservation and courier sorting."
    />
  );
}
