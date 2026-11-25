import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy without nonces: the prerendered shells of Cache
 * Components cannot carry a per-request nonce, so inline scripts stay
 * allowed. The policy still blocks foreign scripts, frames, plugins and
 * outbound connections to other origins. See SECURITY.md.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // One language per build (src/lib/i18n.ts). Inlined into server and browser code, so it cannot
  // change at run time or per request. Anything but "en" means German.
  env: { APP_LOCALE: process.env.APP_LOCALE === "en" ? "en" : "de" },
  // Local English preview and its browser tests build into .next-en (e2e/en.mjs), so a German and an
  // English build can sit side by side. Hosting builds use the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // A page visited in this tab is reused for five minutes when the user comes back, instead of being
  // rendered again with its loading placeholder. The views keep their data fresh themselves
  // (lib/client/views.ts); a Server Action that revalidates and every sign-in or sign-out clear it.
  experimental: { staleTimes: { dynamic: 300 } },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
