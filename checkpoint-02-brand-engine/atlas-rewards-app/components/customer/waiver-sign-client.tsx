"use client";
/**
 * WaiverSignClient — CP-135
 *
 * The signing screen. Order matters and is enforced server-side too:
 *   read the waiver → name → signature (draw, or type as a fallback) →
 *   consent checkbox → Sign → sign_waiver() records it against the exact
 *   version, completes the campaign, and only THEN issues the reward.
 * A campaign without a waiver skips straight to complete_signup_campaign().
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSignature, Gift, PenLine, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useAppBase } from "@/lib/use-app-base";
import { SignaturePad } from "@/components/customer/signature-pad";
import { forgetCampaign } from "@/lib/campaign-storage";
import type { Business } from "@/lib/types/database";

export type CampaignInfo = {
  id: string; slug: string; headline: string; description: string | null;
  reward_kind: "none" | "points" | "offer"; points_amount: number | null; offer_title: string | null;
};
export type WaiverInfo = {
  waiver_id: string; waiver_title: string; version_id: string; version_no: number;
  body_text: string; document_url: string | null;
};
type Result = { campaign_completed: boolean; reward_kind: string; reward_points: number | null; reward_code: string | null; reward_offer_title: string | null };

const CONSENT = "I have read and understand this waiver, I am signing it voluntarily, and I agree to be bound by its terms.";

export function WaiverSignClient({
  business, membershipId, defaultName, campaign, waiver, alreadySignedCurrent,
}: {
  business: Business;
  membershipId: string | null;
  defaultName: string;
  campaign: CampaignInfo | null;
  waiver: WaiverInfo | null;
  alreadySignedCurrent: boolean;
}) {
  const router = useRouter();
  const appBase = useAppBase(business.slug);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [sig, setSig] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);

  const rewardLine = useMemo(() => {
    if (!campaign) return null;
    if (campaign.reward_kind === "points") return `+${campaign.points_amount ?? 0} points`;
    if (campaign.reward_kind === "offer") return campaign.offer_title ?? "a reward";
    return null;
  }, [campaign]);

  // Campaign with no waiver: complete immediately on load.
  useEffect(() => {
    if (!campaign || waiver || result || !membershipId) return;
    (async () => {
      setBusy(true);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("complete_signup_campaign", { p_business_id: business.id, p_campaign_slug: campaign.slug });
      setBusy(false);
      if (error) { setErr(error.message); return; }
      const row = (Array.isArray(data) ? data[0] : data) as Result;
      forgetCampaign(business.slug);
      setResult(row);
    })();
  }, [campaign, waiver, result, membershipId, business.id, business.slug]);

  const canSign = !!waiver && !!membershipId && name.trim().length >= 2 && agree
    && (mode === "draw" ? !!sig : typed.trim().length >= 2);

  async function sign() {
    if (!waiver || !canSign) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("sign_waiver", {
      p_business_id: business.id,
      p_waiver_id: waiver.waiver_id,
      p_version_id: waiver.version_id,
      p_signer_name: name.trim(),
      p_signature_data_url: mode === "draw" ? sig : null,
      p_signature_typed: mode === "type" ? typed.trim() : null,
      p_consent_text: CONSENT,
      p_campaign_slug: campaign?.slug ?? null,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Result;
    forgetCampaign(business.slug);
    setResult(row);
  }

  function goHome() {
    const pts = result?.campaign_completed && result.reward_kind === "points" ? result.reward_points ?? 0 : 0;
    router.replace(pts > 0 ? `${appBase}?celebrate=${pts}` : appBase);
    router.refresh();
  }

  // ── done ─────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="p-4 pt-8">
        <div className="rounded-3xl bg-white border shadow-sm p-6 text-center">
          <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center text-white"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black mt-4 text-zinc-900">{waiver ? "Waiver signed" : "You're in"}</h1>
          {waiver && <p className="text-sm text-zinc-500 mt-1">We&apos;ve recorded it — staff can see it at the front desk.</p>}

          {result.campaign_completed && result.reward_kind === "points" && (
            <div className="mt-5 rounded-2xl p-4" style={{ background: `${primary}12` }}>
              <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: primary }}>Your reward</div>
              <div className="text-3xl font-black mt-1" style={{ color: primary }}>+{result.reward_points} points</div>
              <div className="text-xs text-zinc-500 mt-1">Already added to your balance.</div>
            </div>
          )}
          {result.campaign_completed && result.reward_kind === "offer" && (
            <div className="mt-5 rounded-2xl p-4" style={{ background: `${primary}12` }}>
              <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: primary }}>Your reward</div>
              <div className="text-xl font-black mt-1 text-zinc-900">{result.reward_offer_title ?? "Reward"}</div>
              {result.reward_code && (
                <>
                  <div className="text-xs text-zinc-500 mt-2">Show this code at the counter</div>
                  <div className="font-mono text-2xl font-black tracking-[0.25em] mt-0.5" style={{ color: primary }}>{result.reward_code}</div>
                </>
              )}
              <div className="text-xs text-zinc-500 mt-2">It&apos;s saved under Rewards → Your saved gifts too.</div>
            </div>
          )}
          {campaign && !result.campaign_completed && (
            <p className="text-sm text-zinc-500 mt-4">This reward was already claimed on your account.</p>
          )}

          <Button onClick={goHome} className="w-full h-12 mt-6 text-white font-bold" style={{ background: primary }}>
            Continue to the app
          </Button>
        </div>
      </div>
    );
  }

  // ── nothing to sign ──────────────────────────────────────────────────
  if (!waiver) {
    return (
      <div className="p-4 pt-8">
        <div className="rounded-3xl bg-white border p-6 text-center">
          <FileSignature className="h-8 w-8 mx-auto text-zinc-300" />
          <div className="font-bold mt-3 text-zinc-900">{busy ? "Setting up your reward…" : "No waiver to sign"}</div>
          {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
          {!busy && <Button variant="outline" className="mt-4" onClick={goHome}>Back to the app</Button>}
        </div>
      </div>
    );
  }

  // ── sign ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pt-5 pb-10">
      {campaign && (
        <div className="rounded-3xl p-5 text-white shadow-lg mb-4"
          style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
          <div className="text-[10px] font-black uppercase tracking-widest opacity-85">Welcome offer</div>
          <div className="text-xl font-black leading-tight mt-1">{campaign.headline}</div>
          {campaign.description && <div className="text-sm opacity-90 mt-1">{campaign.description}</div>}
          {rewardLine && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold bg-white/20 rounded-full px-3 py-1">
              <Gift className="h-3.5 w-3.5" /> {rewardLine} after you sign
            </div>
          )}
        </div>
      )}

      {alreadySignedCurrent && (
        <div className="rounded-2xl border bg-emerald-50 border-emerald-200 p-3 text-sm text-emerald-800 mb-4">
          You&apos;ve already signed the current version of this waiver. Signing again is fine — it just adds a fresh record.
        </div>
      )}

      <div className="rounded-3xl bg-white border shadow-sm overflow-hidden">
        <div className="px-5 pt-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{business.name} · version {waiver.version_no}</div>
          <h1 className="text-xl font-black text-zinc-900 mt-1">{waiver.waiver_title}</h1>
          <p className="text-xs text-zinc-500 mt-1">Please read the whole document before signing.</p>
        </div>

        <div
          className="mx-5 mt-3 max-h-64 overflow-y-auto rounded-xl border bg-zinc-50 p-4 text-[13px] leading-relaxed text-zinc-800 whitespace-pre-line"
          onScroll={(e) => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight >= t.scrollHeight - 8) setScrolledEnd(true); }}
        >
          {waiver.body_text}
        </div>
        {waiver.document_url && (
          <a href={waiver.document_url} target="_blank" rel="noreferrer" className="mx-5 mt-2 inline-block text-xs font-semibold underline" style={{ color: primary }}>
            Open the full document
          </a>
        )}
        {!scrolledEnd && <div className="mx-5 mt-1 text-[11px] text-zinc-400">Scroll to the end ↓</div>}

        <div className="px-5 mt-5 space-y-4">
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Your full legal name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" className="mt-1.5 h-11" autoComplete="name" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Signature</label>
              <div className="inline-flex rounded-full bg-zinc-100 p-0.5">
                <button type="button" onClick={() => setMode("draw")} className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${mode === "draw" ? "bg-white shadow text-zinc-900" : "text-zinc-500"}`}><PenLine className="h-3 w-3" /> Draw</button>
                <button type="button" onClick={() => setMode("type")} className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${mode === "type" ? "bg-white shadow text-zinc-900" : "text-zinc-500"}`}><Type className="h-3 w-3" /> Type</button>
              </div>
            </div>
            <div className="mt-1.5">
              {mode === "draw" ? (
                <SignaturePad onChange={setSig} primary="#111827" />
              ) : (
                <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your full name as your signature"
                  className="h-14 text-2xl italic font-serif" />
              )}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 rounded" />
            <span className="text-[12.5px] leading-snug text-zinc-700">{CONSENT}</span>
          </label>

          {err && <p className="text-sm text-red-600">{err}</p>}
          {!membershipId && <p className="text-sm text-amber-700">Finish creating your account first, then come back to sign.</p>}
        </div>

        <div className="p-5">
          <Button onClick={sign} disabled={!canSign || busy} className="w-full h-13 text-base font-black text-white" style={{ background: primary }}>
            {busy ? "Recording…" : campaign && rewardLine ? `Sign & claim ${rewardLine}` : "Sign waiver"}
          </Button>
          <p className="text-[10.5px] text-zinc-400 text-center mt-2">
            Your signature, name, and the time are stored with version {waiver.version_no} of this document and are visible to {business.name} staff.
          </p>
        </div>
      </div>
    </div>
  );
}
