import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.STRESSFORGE_CONTAINER_BUILD === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // This compatible baseline does not restrict Next's script execution.
        // A nonce-based script policy needs a separate hydration/animation audit.
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      ],
    }];
  },
  // Keep browser-audit builds separate from a running development server.
  distDir: process.env.STRESSFORGE_AUDIT_BUILD === "dev"
    ? ".next-audit-dev"
    : process.env.STRESSFORGE_AUDIT_BUILD === "1" ? ".next-audit" : ".next",
  experimental: {
    cpus: process.env.STRESSFORGE_BUILD_WORKERS === "1" ? 1 : undefined,
    agentUpgrade: "security",
  },
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
