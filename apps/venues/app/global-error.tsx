"use client";
// CP-218: last-resort boundary (an error in a root layout). Must render its own <html>.
import "./globals.css";
import { RouteError } from "@/components/ui/route-error";
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-white">
        <RouteError {...props} />
      </body>
    </html>
  );
}
