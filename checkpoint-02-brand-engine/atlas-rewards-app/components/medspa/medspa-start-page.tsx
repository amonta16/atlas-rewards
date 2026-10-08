"use client";
/**
 * components/medspa/medspa-start-page.tsx — CP-202 · the funnel on its own page, in the brand ocean.
 * Blue-lines ocean background (public/landing/blue-lines.jpg, the same artwork as
 * atlas-engine.app's bands), white logo, one white card holding the funnel.
 *
 * A/B: the arm is saved on the lead —
 *   "quiz-first"  arrived here straight from an ad (no ?from=landing)
 *   "lp-phone" / "lp-video"  came through the /medspa landing page, with its hero arm
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { track } from "@/lib/landing/analytics";
import { MedspaFunnel } from "./medspa-funnel";

export function MedspaStartPage() {
  const [ctx, setCtx] = useState<{ source: string; variant: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const hero = p.get("hero");
    const variant = p.get("from") === "landing" ? `lp-${hero === "video" ? "video" : "phone"}` : "quiz-first";
    const where = p.get("at") ?? (p.get("lead") ? "return" : "direct");
    const source = ["medspa", variant, p.get("utm_source"), p.get("utm_campaign"), p.get("utm_content"), where].filter(Boolean).join(":").slice(0, 120);
    setCtx({ source, variant });
    if (variant === "quiz-first") track("variant_assigned", { test: "entry", variant, source });
  }, []);

  return (
    <div className="site s-ocean relative min-h-screen overflow-x-clip">
      <div className="s-ocean-img" style={{ position: "fixed" }} aria-hidden />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-[#06318F]/40" />
      <header className="relative z-10">
        <div className="s-wrap flex h-[68px] items-center justify-between">
          <a href="/medspa" className="s-focus rounded-md" aria-label="Atlas Engine for med spas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/atlas-engine-logo.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
          </a>
          <span className="hidden text-[13.5px] font-semibold text-white/85 sm:block">For med spas and aesthetic practices</span>
        </div>
      </header>

      <main className="relative z-10 pb-16 pt-4 sm:pt-8">
        <div className="s-wrap">
          <div className="mx-auto max-w-[1060px]">
            <div className="mb-6 text-center sm:mb-8">
              <h1 className="s-load-1 mx-auto max-w-[20ch] text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.035em] text-white">See your practice&apos;s app in 60 seconds.</h1>
              <p className="s-load-2 mx-auto mt-3 max-w-[34rem] text-[1.02rem] text-white/85">Seven taps. Your app takes shape as you answer, then you see what patient recall could win back.</p>
            </div>
            <div className="s-load-2 rounded-[30px] bg-white p-5 text-[var(--s-ink)] shadow-[0_40px_90px_-40px_rgba(2,20,70,.7)] ring-1 ring-white/60 sm:p-9">
              {ctx ? <MedspaFunnel source={ctx.source} variant={ctx.variant} /> : <div className="h-[460px]" aria-hidden />}
            </div>
            <ul className="mx-auto mt-7 flex max-w-[860px] flex-wrap justify-center gap-x-6 gap-y-2 text-[13.5px] font-semibold text-white/90">
              {["Nothing to install", "Your name on the app", "Live in about a week", "Month to month"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4" strokeWidth={3} aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </main>
      <footer className="relative z-10 pb-8 text-center text-[12.5px] text-white/70">© {new Date().getFullYear()} Atlas Engine · <a className="hover:text-white" href="/legal/privacy">Privacy</a> · <a className="hover:text-white" href="/legal/terms">Terms</a></footer>
    </div>
  );
}
