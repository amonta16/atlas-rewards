import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { DemoRequestForm } from "@/components/landing/demo-request-form";
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
    <div className={`lp-root ${interClass} min-h-screen bg-[#07090f] text-white antialiased`}>
      <div className="lp-grid pointer-events-none fixed inset-0 opacity-30" aria-hidden />
      <div className="pointer-events-none fixed -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.16),transparent)] blur-2xl" aria-hidden />
      <main className="lp-container relative py-10 md:py-16">
        <Link href="/" className="lp-focus inline-flex items-center gap-2 rounded-md text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Atlas Engine
        </Link>
        <div className="mt-8 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/atlas-engine-logo.png" alt="Atlas Engine" width={1315} height={494} className="h-9 w-auto" />
            <h1 className="mt-8 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              See your rewards app <span className="lp-gradient-text">in your brand.</span>
            </h1>
            <p className="mt-5 text-lg text-zinc-400">A 20-minute walkthrough — the customer app, the front-desk flow, and the Impact dashboard.</p>
            <ul className="mt-6 space-y-2.5 text-[15px] text-zinc-300">
              {["We mock up your brand live on the call", "Bring your questions about setup, staff and pricing", "No contract, no pressure"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-card p-6 sm:p-8">
            <DemoRequestForm source="book_demo_page" />
          </div>
        </div>
      </main>
    </div>
  );
}
