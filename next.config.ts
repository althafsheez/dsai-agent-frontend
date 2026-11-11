import type { NextConfig } from "next";
const config: NextConfig = {
  // Keep live preview caches independent of production verification.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: { cpus: 2 },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};
export default config;
