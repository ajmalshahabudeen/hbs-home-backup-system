import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@workspace/ui",
    "@workspace/auth",
    "@workspace/db",
  ],
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "better-auth",
    "sharp",
    "ioredis",
  ],
  output: "standalone",
  /**
   * CORS for multi-client LAN access (phones/tablets on same Wi‑Fi).
   * Prefer same-origin client calls (window.location.origin) — these headers
   * are a safety net if a client still hits a different host.
   */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Origin, Cookie",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
