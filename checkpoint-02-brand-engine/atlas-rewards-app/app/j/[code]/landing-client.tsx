"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Copy, Check, Smartphone, Globe, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CP-74: client half of the /j/<code> smart landing.
 * Detects the visitor's platform to lead with the right store badge.
 * Store badges only render once the env URLs exist (post-store-launch);
 * until then "Continue in browser" is the primary CTA so today's printed
 * QRs are already correct and never need reprinting.
 */

export type LandingBusiness = {
  slug: string;
  name: string;
  join_code: string | null;
  logo_url: string | null;
  app_icon_url?: string | null;
  hero_image_url?: string | null;
  brand_colors: { primary: string; secondary: string; accent: string };
  header_color?: string | null;
};

export function JoinLandingClient({
  business,
  code,
  appStoreUrl,
  playStoreUrl,
}: {
  business: LandingBusiness | null;
  code: string;
  appStoreUrl: string;
  playStoreUrl: string;
}) {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform("ios");
    else if (/Android/i.test(ua)) setPlatform("android");
  }, []);

  if (!business) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full rounded-3xl border bg-white p-8 text-center shadow-sm">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 mb-4">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Hmm, we can&apos;t find that one</h1>
          <p className="text-sm text-zinc-500 mt-2">
            The code <span className="font-mono font-bold">{code || "—"}</span> doesn&apos;t match any business.
            The QR might be old — ask the front desk for their current code.
          </p>
          <Button className="w-full h-11 mt-5" onClick={() => { window.location.href = "/join"; }}>
            Enter a code manually
          </Button>
        </div>
      </main>
    );
  }

  const primary = business.brand_colors?.primary ?? "#0891b2";
  const secondary = business.brand_colors?.secondary ?? "#06b6d4";
  const logo = business.app_icon_url || business.logo_url || null;
  const joinCode = business.join_code ?? code;
  // Android carries the join context through install via the Play
  // Install Referrer API — the app reads it on first launch and auto-joins.
  const playUrlWithReferrer = playStoreUrl
    ? `${playStoreUrl}${playStoreUrl.includes("?") ? "&" : "?"}referrer=${encodeURIComponent(joinCode)}`
    : "";
  const hasStores = Boolean(appStoreUrl || playStoreUrl);

  function copyCode() {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const storeButtons = [
    playUrlWithReferrer && (
      <a key="play" href={playUrlWithReferrer} className="block">
        <Button className="w-full h-12 text-base font-semibold" style={{ background: primary }}>
          <Smartphone className="h-5 w-5 mr-2" /> Get it on Google Play
        </Button>
      </a>
    ),
    appStoreUrl && (
      <a key="ios" href={appStoreUrl} className="block">
        <Button className="w-full h-12 text-base font-semibold" style={{ background: primary }}>
          <Smartphone className="h-5 w-5 mr-2" /> Download on the App Store
        </Button>
      </a>
    ),
  ].filter(Boolean);
  // Lead with the visitor's own platform.
  if (platform === "ios") storeButtons.reverse();

  return (
    <main className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-3xl border bg-white overflow-hidden shadow-sm">
        {/* Branded hero */}
        <div
          className="px-6 pt-10 pb-8 text-center"
          style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={business.name} className="h-20 w-20 rounded-3xl mx-auto bg-white object-cover shadow-lg" />
          ) : (
            <div className="h-20 w-20 rounded-3xl mx-auto bg-white/20 flex items-center justify-center text-white text-3xl font-black">
              {business.name.charAt(0)}
            </div>
          )}
          <h1 className="text-white text-2xl font-extrabold mt-4">{business.name}</h1>
          <p className="text-white/85 text-sm mt-1">Earn points, unlock rewards, get member-only offers.</p>
        </div>

        <div className="p-6 space-y-4">
          {hasStores ? (
            <>
              <div className="space-y-2">{storeButtons}</div>
              {/* iOS loses install context — surface the code so the customer
                  can type it right after installing. */}
              <div className="rounded-2xl bg-zinc-50 border p-4 text-center">
                <div className="text-[11px] uppercase tracking-widest font-bold text-zinc-400">
                  After installing, join with code
                </div>
                <button
                  onClick={copyCode}
                  className="mt-1 inline-flex items-center gap-2 text-2xl font-black tracking-[0.2em] text-zinc-900"
                >
                  {joinCode}
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-zinc-400" />}
                </button>
              </div>
              <button
                className="w-full text-sm text-zinc-500 hover:text-zinc-700 inline-flex items-center justify-center gap-1.5"
                onClick={() => { window.location.href = `/qr/${business.slug}`; }}
              >
                <Globe className="h-4 w-4" /> Or continue in your browser
              </button>
            </>
          ) : (
            /* Pre-store-launch: browser PWA is the primary path */
            <>
              <Button
                className="w-full h-12 text-base font-semibold"
                style={{ background: primary }}
                onClick={() => { window.location.href = `/qr/${business.slug}`; }}
              >
                Join {business.name} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <p className="text-center text-xs text-zinc-400">
                Free to join · takes about 30 seconds
              </p>
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 mt-6">Powered by Atlas Rewards</p>
    </main>
  );
}
