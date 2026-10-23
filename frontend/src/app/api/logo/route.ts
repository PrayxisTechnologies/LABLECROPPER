import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SOURCE_PATH = "C:\\Users\\Prashant Singh\\Downloads\\OFFICIAL LOGO.png";
const PUBLIC_LOGO = path.join(process.cwd(), "public", "logo.png");

export async function GET() {
  try {
    // 1. If public/logo.png exists, serve it
    if (fs.existsSync(PUBLIC_LOGO)) {
      const buffer = fs.readFileSync(PUBLIC_LOGO);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 2. If source exists in Downloads, copy to public and serve
    if (fs.existsSync(SOURCE_PATH)) {
      const dir = path.dirname(PUBLIC_LOGO);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.copyFileSync(SOURCE_PATH, PUBLIC_LOGO);
      const buffer = fs.readFileSync(PUBLIC_LOGO);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch (error) {
    console.error("Error reading or copying official logo:", error);
  }

  return new NextResponse(null, { status: 404 });
}
