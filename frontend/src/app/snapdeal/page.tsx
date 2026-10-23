import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Snapdeal Shipping Label Cropper (4×6 Thermal Format)",
  description:
    "Free online Snapdeal shipping label cropper. Crop Snapdeal order labels to 4x6 thermal printer size with courier barcode preservation.",
  keywords: [
    "Snapdeal label cropper",
    "Snapdeal shipping label 4x6",
  ],
};

export default function SnapdealCropperPage() {
  return (
    <CropLabelsPage
      platformName="Snapdeal"
      platformTitle="Crop Snapdeal Shipping Labels"
      platformSubtitle="Upload Snapdeal label PDFs for automated 4×6 thermal formatting, invoice removal, and SKU tracking."
    />
  );
}
