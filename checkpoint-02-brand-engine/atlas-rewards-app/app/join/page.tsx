"use client";
import { useEffect, useState } from "react";
import { QrCode, ArrowRight, Sparkles, Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isNative, scanQrCode, getInstallReferrer,
  prefGet, prefRemove, PREF_LAST_BUSINESS,
} from "@/lib/native";

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

const BOOTED_KEY = "atlas-native-booted";

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biz, setBiz] = useState<FoundBusiness | null>(null);
  const [native, setNative] = useState(false);

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
    if (sessionStorage.getItem(BOOTED_KEY)) return;
    sessionStorage.setItem(BOOTED_KEY, "1");
    if (new URLSearchParams(window.location.search).get("stay")) return;

    (async () => {
      const last = await prefGet(PREF_LAST_BUSINESS);
      if (last && /^[a-z0-9-]+$/.test(last)) {
        window.location.href = `/qr/${last}`;
        return;
      }
      const ref = await getInstallReferrer();
      if (ref) {
        const found = await lookup(ref);
        if (found) setBiz(found); // show the branded confirm — never silently sign up
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
      window.location.href = `/qr/${qrMatch[1]}`;
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Atlas header — neutral until a business is found */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-600 text-white shadow-lg shadow-cyan-600/25 mb-4">
            <Sparkles className="h-7 w-7" />
          </div>
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
                onClick={() => { window.location.href = `/qr/${biz.slug}`; }}
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
