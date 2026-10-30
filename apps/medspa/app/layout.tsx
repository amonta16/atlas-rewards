import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const hanken = localFont({ src: "./fonts/hanken.woff2", weight: "100 900", display: "swap", variable: "--font-hanken" });

export const metadata: Metadata = {
  title: { default: "Atlas Med Spa", template: "%s" },
  description: "Your med spa: memberships, treatments, rewards and booking in one app.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Med Spa" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F6F5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={hanken.variable}>
      <body className="bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
