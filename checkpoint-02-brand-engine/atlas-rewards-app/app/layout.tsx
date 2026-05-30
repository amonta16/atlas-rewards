import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {/* CP-31: app-wide toaster — every alert() should migrate to this. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
