import type { CapacitorConfig } from "@capacitor/cli";

/**
 * CP-76: Atlas Rewards mobile shell.
 *
 * Remote-URL architecture: the webview loads the LIVE deployment, so every
 * web-layer ship (offers, branding, checkpoints) reaches the app instantly
 * with no store review. Native capabilities (QR camera, Preferences,
 * app-info for the CP-75 version gate, push in CP-77) are bridged in by
 * the plugins below — the web app talks to them via lib/native.ts.
 *
 * ⚠ PRODUCTION DOMAIN: update `server.url` + `allowNavigation` if the
 * root domain ever changes. `/join` is the boot screen — it forwards
 * returning customers to their business automatically (native Preferences).
 */
const config: CapacitorConfig = {
  appId: "com.atlasengine.rewards",
  appName: "Atlas Rewards",
  webDir: "www",
  server: {
    // www: the apex 301-redirects to www — boot the final URL directly.
    url: "https://www.atlas-engine.app/join",
    // Keep every business subdomain INSIDE the webview; anything else
    // (Google Maps, Stripe checkout, review links) opens the system browser.
    allowNavigation: ["atlas-engine.app", "*.atlas-engine.app"],
    errorPath: "error.html",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
