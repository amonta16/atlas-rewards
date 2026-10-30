/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },

  // CP-68: TYPE ERRORS NOW FAIL THE BUILD. The old ignoreBuildErrors:true
  // (a CP-32 go-live shortcut) let a real runtime bug ship to production in
  // CP-67 — TypeScript had flagged it, but Vercel deployed anyway. If a
  // deploy fails with type errors from here on, that's the gate doing its
  // job: fix the error (or ask Claude to), don't flip this back.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint stays non-blocking — style warnings shouldn't stop a deploy.
  eslint: {
    ignoreDuringBuilds: true,
  },

  // CP-44: baseline security headers (clickjacking, MIME-sniffing, referrer
  // leakage, HSTS). Camera (QR scanner) + microphone (owner voice memos) are
  // allowed for same-origin; geolocation is disabled. We deliberately skip a
  // strict Content-Security-Policy here to avoid breaking Supabase / Stripe /
  // GHL / inline brand styles — revisit with a report-only CSP post-launch.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};
export default nextConfig;
