import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [],
  experimental: {
    // node:sqlite is built into Node — keep API routes on the Node runtime
  },
};

export default nextConfig;
