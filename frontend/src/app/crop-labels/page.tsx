import type { Metadata } from "next";
import CropLabelsPage from "@/components/CropLabelsPage";

export const metadata: Metadata = {
  title: "Multi-Platform Shipping Label Cropper (4×6 Thermal Format)",
  description:
    "Free online shipping label cropper. Crop Meesho, Flipkart, Snapdeal, Amazon, and Myntra logistics labels to 4x6 thermal printer size.",
};

export default function Page() {
  return <CropLabelsPage platformName="Meesho" />;
}
