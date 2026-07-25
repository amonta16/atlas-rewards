import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { NativeShell } from "@/components/native/native-shell";
export const metadata: Metadata = {
  metadataBase: new URL("https://atlas-engine.app"),
  title: {
    default: "Atlas Engine — Loyalty for Local Business",
    template: "%s · Atlas Engine",
  },
  description:
    "Your own branded loyalty app. Live in 30 minutes. Built for local business.",
  // CP-41: explicit Atlas-engine.app icons. The per-business [business]/
  // layout overrides these with the business's logo for customer apps;
  // these defaults are what shows on atlas-engine.app itself + tabs.
  icons: {
    icon: "/atlas-favicon.png",
    apple: "/atlas-apple-touch.png",
    shortcut: "/atlas-favicon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Atlas Engine",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Atlas Engine — Loyalty for Local Business",
    description: "Your own branded loyalty app. Live in 30 minutes.",
    siteName: "Atlas Engine",
    type: "website",
  },
};
export const viewport: Viewport = {
  themeColor: "#0a3d62",
  width: "device-width",
  initialScale: 1,
  // CP-84: cap zoom at 1x. iOS auto-zooms when a text input gets focus and,
  // inside the native shell (WKWebView), never zooms back out — customers got
  // stuck zoomed-in after login. Safari still allows pinch-zoom for
  // accessibility regardless of these flags; the native apps stay locked at 1x.
  maximumScale: 1,
  userScalable: false,
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {/* CP-31: app-wide toaster — every alert() should migrate to this. */}
        {/* CP-76: native shell glue — renders nothing on the web/PWA. */}
        <NativeShell />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}