import type { NextConfig } from "next";
const config: NextConfig = {
  // Keep live preview caches independent of production verification.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: { cpus: 2 },
};
export default config;

