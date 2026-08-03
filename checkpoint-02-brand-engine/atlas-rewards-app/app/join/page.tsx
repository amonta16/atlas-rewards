"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { QrCode, ArrowRight, Loader2, Camera, Check, ChevronRight, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isNative, scanQrCode, getInstallReferrer,
  prefGet, prefSet, prefRemove, PREF_LAST_BUSINESS,
} from "@/lib/native";

/**
 * CP-97: inside the native shell, STAY on the boot origin (www) and use
 * path routing to enter a business. On Android, Capacitor only injects
 * the plugin bridge into pages from the configured server origin — the
 * moment the webview hopped to a business SUBDOMAIN, every plugin call
 * threw "not implemented": no push permission prompt, no push
 * registration, no Preferences. iOS injects everywhere, which is why
 * this only bit Android. Regular web browsers keep the subdomain flow.
 */
function businessEntryUrl(slug: string): string {
  return isNative() ? `/${slug}` : `/qr/${slug}`;
}

/**
 * CP-74: The pre-join screen — the neutral "front door" of Atlas Rewards.
 * CP-76: native-aware. Inside the Capacitor app this screen additionally:
 *   - boots straight into the last-joined business (native Preferences,
 *     written by NativeShell on the business subdomain) — once per cold
 *     start, and never when opened with ?stay=1 (the "switch business" path)
 *   - auto-joins from the Play Install Referrer (the ?referrer=<code> we
 *     put on the store link at /j/<code>)
 *   - offers a native camera "Scan QR" button
 *
 * Apex-domain only; business subdomains rewrite paths under /[business].
 * Flow: code → join_business_by_code RPC (anon, branding only) → branded
 * confirmation card → /qr/<slug> (owns the subdomain redirect, CP-43.2).
 */

type FoundBusiness = {
  found: boolean;
  slug?: string;
  name?: string;
  join_code?: string;
  logo_url?: string | null;
  app_icon_url?: string | null;
  brand_colors?: { primary: string; secondary: string; accent: string };
};

/** CP-93: row from my_memberships — the boot-time business chooser. */
type BootShop = {
  business_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  app_icon_url: string | null;
  brand_colors: { primary?: string; secondary?: string } | null;
  points_balance: number;
  tier: string;
};

// CP-76.2: cold-start guard. Was sessionStorage — but Android WebView
// RESTORES sessionStorage across app restarts, so the app believed it had
// already auto-booted and showed the code screen again. A module-scope
// variable resets on every full page load, which is exactly a cold start.
let bootRan = false;

// CP-80: SSR-safe pre-paint effect — useLayoutEffect on the client so the
// boot splash is decided BEFORE first paint (kills the "enter code" flash
// for returning customers), plain useEffect during SSR to avoid warnings.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biz, setBiz] = useState<FoundBusiness | null>(null);
  const [native, setNative] = useState(false);
  // CP-80: true while the native cold-start decision (last business /
  // install referrer) is still pending — render a splash, not the form.
  const [booting, setBooting] = useState(false);
  // CP-93: when the signed-in customer belongs to MORE THAN ONE business,
  // cold start shows this chooser instead of silently forwarding to the
  // last-used one. Andrew's ask: pick the shop BEFORE any app loads.
  const [chooser, setChooser] = useState<BootShop[] | null>(null);
  const [lastSlug, setLastSlug] = useState<string | null>(null);

  // Runs before paint: if a cold-start boot is about to happen, hold the UI.
  useIsomorphicLayoutEffect(() => {
    if (!isNative() || bootRan) return;
    if (new URLSearchParams(window.location.search).get("stay")) return;
    setBooting(true);
  }, []);

  async function lookup(raw: string): Promise<FoundBusiness | null> {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length < 3 || clean.length > 24) return null;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("join_business_by_code", { p_code: clean });
    if (error) return null;
    const result = data as FoundBusiness;
    return result?.found ? result : null;
  }

  // CP-76: native cold-start boot — last business, else install referrer.
  useEffect(() => {
    if (!isNative()) return;
    setNative(true);
    if (bootRan) return;
    bootRan = true;
    if (new URLSearchParams(window.location.search).get("stay")) return;

    (async () => {
      let navigating = false;
      try {
        const last = await prefGet(PREF_LAST_BUSINESS);

        // CP-93: signed-in customer with SEVERAL shops → choose first.
        // The CP-81 parent-domain cookie makes the session valid here on
        // the apex, so my_memberships works from the boot screen.
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase.rpc("my_memberships");
            const shops = (Array.isArray(data) ? data : []) as BootShop[];
            if (shops.length > 1) {
              setLastSlug(last && /^[a-z0-9-]+$/.test(last) ? last : null);
              setChooser(shops);
              return; // splash drops in finally → chooser renders
            }
            if (shops.length === 1 && shops[0].slug) {
              navigating = true;
              await prefSet(PREF_LAST_BUSINESS, shops[0].slug);
              window.location.href = businessEntryUrl(shops[0].slug);
              return;
            }
          }
        } catch {
          /* offline / RPC missing — fall back to the legacy boot below */
        }

        if (last && /^[a-z0-9-]+$/.test(last)) {
          // Keep the splash up — the page is navigating away.
          navigating = true;
          window.location.href = businessEntryUrl(last);
          return;
        }
        const ref = await getInstallReferrer();
        if (ref) {
          const found = await lookup(ref);
          if (found) setBiz(found); // show the branded confirm — never silently sign up
        }
      } finally {
        // No stored business to forward to → reveal the join form / chooser.
        if (!navigating) setBooting(false);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length < 3) {
      setErr("Codes are at least 3 letters/numbers — check the sign or receipt.");
      return;
    }
    setLoading(true);
    setErr(null);
    const found = await lookup(clean);
    setLoading(false);
    if (!found) {
      setErr(`We couldn't find a business with code "${clean.toUpperCase()}". Double-check it and try again.`);
      return;
    }
    setBiz(found);
  }

  // CP-76: native camera scan — accepts /j/<code>, /qr/<slug>, or a bare code.
  async function onScan() {
    setErr(null);
    const raw = await scanQrCode();
    if (!raw) return; // cancelled or plugin unavailable
    const jMatch = raw.match(/\/j\/([a-zA-Z0-9]+)/);
    const qrMatch = raw.match(/\/qr\/([a-z0-9-]+)/);
    if (qrMatch) {
      // CP-76.1: persist HERE on the apex origin — the Capacitor bridge is
      // always injected on the boot origin, but not reliably on business
      // subdomains, so saving there can silently no-op.
      await prefSet(PREF_LAST_BUSINESS, qrMatch[1]);
      window.location.href = businessEntryUrl(qrMatch[1]);
      return;
    }
    const candidate = jMatch?.[1] ?? (/^[a-zA-Z0-9]{3,24}$/.test(raw.trim()) ? raw.trim() : null);
    if (!candidate) {
      setErr("That QR isn't an Atlas Rewards business code. Ask the front desk for theirs.");
      return;
    }
    setLoading(true);
    const found = await lookup(candidate);
    setLoading(false);
    if (!found) {
      setErr("That QR looks like ours, but we couldn't find the business. Ask the front desk for their code.");
      return;
    }
    setBiz(found);
  }

  const primary = biz?.brand_colors?.primary ?? "#0891b2";
  const secondary = biz?.brand_colors?.secondary ?? "#06b6d4";
  const logo = biz?.app_icon_url || biz?.logo_url || null;

  // CP-80: boot splash — shown while deciding whether to forward a
  // returning customer, so the join form never flashes first.
  if (booting) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* CP-81.3: real Atlas logo instead of the placeholder sparkle. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/atlas-icon-512.png"
            alt="Atlas Rewards"
            className="h-16 w-16 rounded-2xl shadow-lg shadow-blue-900/25"
          />
          <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />
        </div>
      </main>
    );
  }

  // CP-93: boot-time business chooser — several shops on one account.
  if (chooser) {
    return (
      <main
        className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-white flex flex-col items-center justify-center px-6 py-12"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3rem)" }}
      >
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/atlas-icon-512.png"
              alt="Atlas Rewards"
              className="inline-block h-14 w-14 rounded-2xl shadow-lg shadow-blue-900/25 mb-3"
            />
            <h1 className="text-xl font-extrabold tracking-tight text-zinc-900">Where to today?</h1>
            <p className="text-sm text-zinc-500 mt-1">Pick a shop — your points are waiting at each one.</p>
          </div>

          <div className="rounded-3xl border bg-white shadow-sm overflow-hidden divide-y">
            {chooser.map((s) => {
              const icon = s.app_icon_url || s.logo_url;
              const shopPrimary = s.brand_colors?.primary || "#0891b2";
              const isLast = s.slug === lastSlug;
              return (
                <button
                  key={s.business_id}
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-zinc-50 transition"
                  onClick={async () => {
                    setBooting(true); // splash while we hand off
                    await prefSet(PREF_LAST_BUSINESS, s.slug);
                    window.location.href = businessEntryUrl(s.slug);
                  }}
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0 ring-1 ring-black/5" />
                  ) : (
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-lg font-extrabold shrink-0"
                      style={{ background: shopPrimary }}
                    >
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-zinc-900 truncate flex items-center gap-2">
                      {s.name}
                      {isLast && (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white"
                          style={{ background: shopPrimary }}
                        >
                          <Check className="h-2.5 w-2.5" /> Recent
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-zinc-500">{s.points_balance.toLocaleString()} points</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setChooser(null)}
            className="mt-4 w-full flex items-center justify-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-700"
          >
            <Store className="h-4 w-4" /> Join a new shop instead
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Atlas header — neutral until a business is found */}
        <div className="text-center mb-8">
          {/* CP-81.3: real Atlas logo instead of the placeholder sparkle. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/atlas-icon-512.png"
            alt="Atlas Rewards"
            className="inline-block h-16 w-16 rounded-2xl shadow-lg shadow-blue-900/25 mb-4"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Atlas Rewards</h1>
          <p className="text-sm text-zinc-500 mt-1">One app for your favorite local spots.</p>
        </div>

        {!biz ? (
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="font-bold text-zinc-900">Join your business</h2>
            <p className="text-sm text-zinc-500 mt-1 mb-4">
              Enter the code from the sign, sticker, or receipt at the counter.
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }}
                placeholder="BUSINESS CODE"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                className="h-12 text-center text-lg font-bold tracking-[0.25em] uppercase"
              />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Find my business <ArrowRight className="h-4 w-4 ml-1" /></>}
              </Button>
            </form>

            {native ? (
              <Button
                variant="outline"
                onClick={onScan}
                disabled={loading}
                className="w-full h-12 mt-3 text-base font-semibold"
              >
                <Camera className="h-5 w-5 mr-2" /> Scan their QR code
              </Button>
            ) : (
              <div className="mt-5 pt-5 border-t flex items-start gap-3 text-sm text-zinc-500">
                <QrCode className="h-5 w-5 mt-0.5 shrink-0 text-zinc-400" />
                <p>
                  Have their QR code instead? Just scan it with your phone camera — it brings you
                  straight here with the business already selected.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Branded confirmation — the moment Atlas "becomes" the business */
          <div className="rounded-3xl border bg-white overflow-hidden shadow-sm">
            <div
              className="px-6 pt-8 pb-6 text-center"
              style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={biz.name ?? "Business logo"} className="h-16 w-16 rounded-2xl mx-auto bg-white object-cover shadow-md" />
              ) : (
                <div className="h-16 w-16 rounded-2xl mx-auto bg-white/20 flex items-center justify-center text-white text-2xl font-black">
                  {(biz.name ?? "?").charAt(0)}
                </div>
              )}
              <h2 className="text-white text-xl font-extrabold mt-3">{biz.name}</h2>
              <p className="text-white/85 text-xs font-semibold tracking-widest uppercase mt-1">Found it!</p>
            </div>
            <div className="p-6 space-y-3">
              <Button
                className="w-full h-12 text-base font-semibold"
                style={{ background: primary }}
                onClick={async () => {
                  // CP-76.1: save the business on the APEX origin (bridge
                  // guaranteed) before handing off to the subdomain.
                  if (biz.slug) await prefSet(PREF_LAST_BUSINESS, biz.slug);
                  window.location.href = businessEntryUrl(biz.slug ?? "");
                }}
              >
                Continue to {biz.name} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <button
                className="w-full text-sm text-zinc-500 hover:text-zinc-700"
                onClick={() => { void prefRemove(PREF_LAST_BUSINESS); setBiz(null); setCode(""); }}
              >
                Not your business? Try another code
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
