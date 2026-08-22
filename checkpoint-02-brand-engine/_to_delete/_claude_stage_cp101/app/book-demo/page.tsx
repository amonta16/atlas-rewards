import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { BookingCalendar } from "@/components/landing/booking-calendar";
import { interClass } from "@/lib/landing/font";

/**
 * CP-100 — standalone demo-request page. Same form as the modal, for ads,
 * email signatures, QR codes and anywhere a plain URL is needed:
 *   https://www.atlas-engine.app/book-demo
 */

export const metadata: Metadata = {
  title: "Book a free demo",
  description: "See your own branded rewards app in 20 minutes. Book a free Atlas Engine demo.",
  alternates: { canonical: "https://www.atlas-engine.app/book-demo" },
  robots: { index: true, follow: true },
};

export default function BookDemoPage() {
  return (
    <div className={`lp-root ${interClass} min-h-screen bg-[#fbf8f2] text-[#14213d] antialiased`}>
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#e9f2f8] via-[#fbf8f2] to-[#fbf8f2]" aria-hidden />
      <div className="lp-noise pointer-events-none fixed inset-0" aria-hidden />
      <main className="lp-container relative py-10 md:py-16">
        <Link href="/" className="lp-focus inline-flex items-center gap-2 rounded-md text-sm text-slate-600 hover:text-[#14213d]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Atlas Engine
        </Link>
        <div className="mt-8 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-9 w-auto" />
            <h1 className="mt-8 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              See your rewards app <span className="lp-gradient-text">in your brand.</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600">A 20-minute walkthrough — the customer app, the front-desk flow, and the Impact dashboard.</p>
            <ul className="mt-6 space-y-2.5 text-[15px] text-slate-700">
              {["We mock up your brand live on the call", "Bring your questions about setup, staff and pricing", "No contract, no pressure"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1f5f8b]" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-card p-6 sm:p-8">
            <BookingCalendar source="book_demo_page" />
          </div>
        </div>
      </main>
    </div>
  );
}

// CP-101: light "Central Coast" palette pass — colors live in app/globals.css (.lp-root tokens).
