import fs from "fs";
import path from "path";

// Auto-sync official logo from Downloads if available
const sourcePath = "C:\\Users\\Prashant Singh\\Downloads\\OFFICIAL LOGO.png";
const destDir = path.join(process.cwd(), "public");
const destPath = path.join(destDir, "logo.png");

try {
  if (fs.existsSync(sourcePath)) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(sourcePath, destPath);
  }
} catch {
  // Silent fallback if running on remote/ci server
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: "https://lablecropper.onrender.com/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
