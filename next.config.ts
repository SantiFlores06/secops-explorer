import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({ isDev: process.env.NODE_ENV === "development" }),
      },
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
