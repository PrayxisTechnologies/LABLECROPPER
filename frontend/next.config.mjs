/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
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
