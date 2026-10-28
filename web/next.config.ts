import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  // The Agent SDK starts Claude Code's native binary from its own package
  // directory; it has to stay a real node_modules package, not be bundled.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // MapLibre's worker, asked for as ?v=<maplibre version> (mapStyle.ts
      // workerUrl): a new version is a new URL, so this one never changes.
      // Without it, public/ files are revalidated on every page load.
      {
        source: "/maplibre-gl-worker.mjs",
        has: [{ type: "query", key: "v" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  devIndicators: false,
};

export default nextConfig;
