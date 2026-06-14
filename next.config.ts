import type { NextConfig } from "next";

// Production security headers. We keep CSP intentionally relaxed because
// WalletConnect, Reown, CoinGecko, and the Hedera Mirror Node all need to
// be reachable from the browser. The big-ticket protections (HSTS, frame
// options, MIME sniffing, referrer leakage) are still in force.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // The MCP server route streams Server-Sent Events; don't let any layer
  // upstream of Next buffer responses.
  poweredByHeader: false,
  // Hide the floating "N" route-status badge Next renders in dev mode. It
  // overlaps modal corners (notably the bulk-account-creation results
  // panel) and adds no value during normal development. Compile/runtime
  // errors are still surfaced as overlays.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
