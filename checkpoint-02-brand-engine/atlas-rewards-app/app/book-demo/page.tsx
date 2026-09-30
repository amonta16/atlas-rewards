import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { DemoBooker } from "@/components/landing/demo-booker";
import { interClass } from "@/lib/landing/font";

/**
 * CP-100 — standalone demo-request page. Same flow as the modal, for ads,
 * email signatures, QR codes and anywhere a plain URL is needed:
 *   https://www.atlas-engine.app/book-demo
 * CP-145: light theme to match the redesigned landing page.
 * CP-176: Owner.com-style — build your app (name, type, color/logo) while you book.
 */

export const metadata: Metadata = {
  title: "Book a free demo",
  description: "Build your venue's guest app in 30 seconds, then book a free 20-minute Atlas Engine demo.",
  alternates: { canonical: "https://www.atlas-engine.app/book-demo" },
  robots: { index: true, follow: true },
};

export default function BookDemoPage() {
  return (
    <div className={`lp-root lp-page ${interClass} min-h-screen antialiased`}>
      <main className="lp-container relative py-10 md:py-16">
        <Link href="/" className="lp-focus inline-flex items-center gap-2 rounded-md text-sm text-slate-500 hover:text-[#14213d]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Atlas Engine
        </Link>
        <div className="mt-8 max-w-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-8 w-auto" />
          <h1 className="mt-8 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-[#14213d] sm:text-5xl">
            See your venue&apos;s app <span className="lp-gradient-text">before we talk.</span>
          </h1>
          <p className="lp-lead mt-5">
            Name it, pick a color or drop in your logo, and tap around — it&apos;s a working app. Then grab 20 minutes for the front desk and the dashboard.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate-700">
            {["We bring your mockup to the call", "Ask anything about setup, staff and pricing", "No contract, no pressure"].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1f5f8b]" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-card mt-10 p-5 sm:p-8">
          <DemoBooker source="book_demo_page" layout="page" />
        </div>
      </main>
    </div>
  );
}
