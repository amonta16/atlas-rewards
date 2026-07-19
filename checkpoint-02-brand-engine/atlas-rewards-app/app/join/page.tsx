"use client";
import { useState } from "react";
import { QrCode, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * CP-74: The pre-join screen — the neutral "front door" of Atlas Rewards.
 *
 * This is the screen the future native app boots into when the customer
 * hasn't joined a business yet. Deliberately minimal (no marketplace, no
 * browse): enter a business code, or scan the business QR with the phone
 * camera. Lives on the APEX domain only — business subdomains rewrite
 * paths under /[business], so QRs and links always point here via the
 * root domain (e.g. https://atlasrewards.app/join).
 *
 * Flow: code → join_business_by_code RPC (anon, branding only) →
 * branded confirmation card → "Continue" → /qr/<slug>, which owns the
 * subdomain-redirect logic (CP-43.2) → business signup/login.
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

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biz, setBiz] = useState<FoundBusiness | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length < 3) {
      setErr("Codes are at least 3 letters/numbers — check the sign or receipt.");
      return;
    }
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("join_business_by_code", { p_code: clean });
    setLoading(false);
    if (error) {
      setErr("Something went wrong — please try again.");
      return;
    }
    const result = data as FoundBusiness;
    if (!result?.found) {
      setErr(`We couldn't find a business with code "${clean.toUpperCase()}". Double-check it and try again.`);
      return;
    }
    setBiz(result);
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

            <div className="mt-5 pt-5 border-t flex items-start gap-3 text-sm text-zinc-500">
              <QrCode className="h-5 w-5 mt-0.5 shrink-0 text-zinc-400" />
              <p>
                Have their QR code instead? Just scan it with your phone camera — it brings you
                straight here with the business already selected.
              </p>
            </div>
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
                onClick={() => { setBiz(null); setCode(""); }}
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
