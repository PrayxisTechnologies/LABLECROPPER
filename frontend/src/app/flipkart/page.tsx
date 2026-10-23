import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Flipkart Shipping Label Cropper (4×6 Thermal)",
  description:
    "Free online Flipkart shipping label cropper. Crop Flipkart logistics labels to 4x6 thermal printer format, isolate tax invoices, and group orders by courier partner (Ekart, Shadowfax, Delhivery).",
  keywords: [
    "Flipkart label cropper",
    "Flipkart shipping label 4x6",
    "Crop Flipkart label online",
    "Ekart label cropper",
    "Flipkart thermal printer label",
  ],
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
