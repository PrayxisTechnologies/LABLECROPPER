import type { Metadata } from "next";
import CropLabelsPage from "../crop-labels/page";

export const metadata: Metadata = {
  title: "Meesho Label Cropper Online — 1-Click 4×6 Thermal Label Crop & Sorter (Free)",
  description:
    "Free online Meesho shipping label cropper for 4x6 thermal printers. Automatically removes customer tax invoices, crops to 100x150 mm, sorts by Valmo, Shadowfax & Delhivery, and generates SKU picklists in seconds.",
  keywords: [
    "Meesho label cropper",
    "Meesho label crop online",
    "Meesho shipping label crop 4x6",
    "Free Meesho label cropper",
    "Crop Meesho label online free",
    "Meesho thermal printer label",
    "Remove tax invoice Meesho",
    "Valmo courier label sorter",
    "Shadowfax Meesho label",
    "Meesho supplier panel label crop",
    "Meesho picklist generator",
  ],
  alternates: {
    canonical: "/meesho-label-cropper",
  },
  openGraph: {
    title: "Meesho Label Cropper Online — 1-Click 4×6 Thermal Roll Labels",
    description:
      "Free 1-click vector cropping for Meesho shipping labels. Separate tax invoices, sort by Valmo/Shadowfax, and print to thermal printers.",
    type: "website",
    url: "/meesho-label-cropper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meesho Label Cropper Online — Free 4×6 Thermal Labels",
    description:
      "Instant 1-click Meesho shipping label crop, invoice separation, and Valmo/Shadowfax courier sorting.",
  },
};

export default function MeeshoPage() {
  return (
    <CropLabelsPage
      platformName="Meesho"
      platformTitle="Meesho Shipping Label Cropper (4×6 Thermal)"
      platformSubtitle="Upload your Meesho supplier PDF to crop 4×6 thermal labels, remove tax invoices, and sort by Valmo & Shadowfax."
    />
  );
}
