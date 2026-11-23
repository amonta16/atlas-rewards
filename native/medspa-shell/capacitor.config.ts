import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MedSpa App — Google Play shell for the med spa patient app.
 *
 * Remote-URL app, same pattern as native/venues-shell: the webview loads the
 * LIVE med.atlas-engine.app, so every web deploy reaches the app with no store
 * review. "/" sends a returning patient straight to their clinic (ms_clinic
 * cookie, flushed to disk in MainActivity) and everyone else to /find.
 *
 * Inside the app: med.atlas-engine.app and the other *.atlas-engine.app hosts
 * (booking pages, legal pages and account deletion live on www). Anything else
 * (Stripe / Klarna checkout, Google Maps, review links) opens the phone's browser.
 *
 * Native pieces the web app talks to (apps/medspa/lib/native.ts):
 *   - push-notifications → FCM token saved by /api/notifications/subscribe
 *   - app                → Android back button walks web history
 * Camera (QR scanner, skin-scan selfie) is plain getUserMedia; Capacitor's
 * WebChromeClient turns the page's request into the Android CAMERA prompt.
 */
const config: CapacitorConfig = {
  appId: "com.atlasengine.medspa",
  appName: "MedSpa App",
  webDir: "www",
  server: {
    url: "https://med.atlas-engine.app/",
    allowNavigation: ["med.atlas-engine.app", "atlas-engine.app", "*.atlas-engine.app"],
    errorPath: "error.html",
  },
  android: {
    allowMixedContent: false,
    // Marks the webview's user agent so the site can tell it's inside the app.
    appendUserAgent: "MedSpaApp/1",
  },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
