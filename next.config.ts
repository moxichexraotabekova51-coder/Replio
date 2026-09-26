import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tezlik o'lchovi uchun production build dev server bilan parallel ishlashi mumkin (NEXT_DIST_DIR=.next-prod)
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
