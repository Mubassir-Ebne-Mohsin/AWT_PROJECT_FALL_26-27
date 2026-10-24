import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep browser-audit builds separate from a running development server.
  distDir: process.env.STRESSFORGE_AUDIT_BUILD === "1" ? ".next-audit" : ".next",
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
