import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Meesho Shipping Label Cropper Online (Free 4×6 Thermal)",
  description:
    "Crop Meesho shipping labels online to 4x6 thermal printer size with 1-click. Automatic invoice removal, courier sorting (Valmo, Shadowfax, Xpressbees), and SKU picklist generation.",
  keywords: [
    "Meesho label cropper",
    "Meesho shipping label crop 4x6",
    "Crop Meesho label online free",
    "Meesho thermal printer label",
    "Valmo courier label sorter",
  ],
};

export default function MeeshoPage() {
  return <CropLabelsPage />;
}
