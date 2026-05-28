import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Atlas Rewards",
  description: "White-label client retention and rewards platform.",
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
