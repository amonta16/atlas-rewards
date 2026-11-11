"use client";
/**
 * CP-242: cookie notice for the marketing site only (atlas-engine.app and
 * www). Business and patient apps (subdomains) use essential cookies only and
 * never show it. Accept and Decline are equally easy, and GPC browsers are
 * treated as declined without asking. See lib/privacy-optout.ts.
 *
 * CP-245.3: the apex domain also serves the apps themselves (path-style
 * /<slug>/app, /<slug>/login, the native shell's single origin, venue
 * websites at /site/<slug>). App users must never see it, so it now shows
 * only on the marketing PAGES (allowlist below) and never inside the native app.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { consentDecided, setConsent, strictRegion } from "@/lib/privacy-optout";
import { isNative } from "@/lib/native";

/** Atlas's own marketing pages: home, niche pages, funnels, demo booking, legal, support. */
const MARKETING_PATH = /^\/(?:|venues|med-spas|book-demo|support)(?:\/.*)?$|^\/legal(?:\/|$)|^\/medspa(?:\/(?:start|confirm|walkthrough)(?:\/.*)?)?\/?$/;

function marketingHost(): boolean {
  const h = location.hostname;
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "atlas-engine.app").toLowerCase();
  return h === root || h === `www.${root}` || h === "localhost" || h === "127.0.0.1" || (h.endsWith(".vercel.app") && h.startsWith("atlas-rewards"));
}

export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [strict, setStrict] = useState(false);
  const pathname = usePathname() ?? "/";
  const onMarketingPage = MARKETING_PATH.test(pathname);
  useEffect(() => {
    // Leaving the marketing site for an app page closes it too.
    if (!onMarketingPage) { setShow(false); return; }
    if (!marketingHost() || isNative() || consentDecided()) return;
    setStrict(strictRegion());
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [onMarketingPage]);
  if (!show) return null;
  const choose = (c: "all" | "essential") => { setConsent(c); setShow(false); };
  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-[560px] rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-800 shadow-[0_18px_50px_-20px_rgba(10,20,40,.45)] sm:inset-x-auto sm:right-5 sm:bottom-5"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <p className="text-[14.5px] font-semibold text-zinc-900">Cookies on atlas-engine.app</p>
      <p className="mt-1 text-[13px] leading-snug text-zinc-600">
        We use essential cookies to run this site. With your OK we also count visits and, when we run ads, use Meta&apos;s
        pixel to see what&apos;s working. {strict ? "Nothing optional runs until you accept." : "You can decline anytime."}{" "}
        <a href="/legal/privacy#cookies" className="underline">Cookie details</a> ·{" "}
        <a href="/legal/privacy#choices" className="underline">Your privacy choices</a>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose("essential")} className="h-10 flex-1 rounded-full border border-zinc-300 bg-white px-4 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-50">
          Decline
        </button>
        <button type="button" onClick={() => choose("all")} className="h-10 flex-1 rounded-full bg-zinc-900 px-4 text-[14px] font-semibold text-white hover:bg-zinc-700">
          Accept
        </button>
      </div>
    </div>
  );
}
