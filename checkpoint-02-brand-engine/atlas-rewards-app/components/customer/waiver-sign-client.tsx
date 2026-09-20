"use client";
/**
 * WaiverSignClient — CP-135, extended by CP-137.
 *
 * The signing screen. Order matters and is enforced server-side too:
 *   read the waiver → name → date of birth → who it covers → signature →
 *   consent → sign_waiver_v2() records it against the exact version,
 *   completes the campaign, and only THEN issues the reward.
 *
 * CP-137 adds three things:
 *   · Date of birth, attested. An adult signature is the whole point of a
 *     waiver, so a date under 18 is refused here AND in the database.
 *   · "Just me" / "Me and minors" — the guardian names the children the
 *     signature covers, which is what an arcade or batting cage actually
 *     needs and what the ROLLER flow was collecting.
 *   · The guardian path. A member who is under 18 gets no bypass button:
 *     they name a parent, the parent receives a link, and the PARENT signs.
 *     Nothing a minor (or an adult pretending to be one) can tap unlocks
 *     the app.
 *
 * `gateMode` is the CP-137 hard gate: rendered by the customer app layout in
 * place of the whole app, so there is nothing else on screen to navigate to.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSignature, Gift, PenLine, Type, MailCheck, Plus, X, RefreshCw, Send, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useAppBase } from "@/lib/use-app-base";
import { SignaturePad } from "@/components/customer/signature-pad";
import { campaignFromLocation, forgetCampaign, readCampaign } from "@/lib/campaign-storage";
import type { Business } from "@/lib/types/database";

export type CampaignInfo = {
  id: string; slug: string; headline: string; description: string | null;
  reward_kind: "none" | "points" | "offer"; points_amount: number | null; offer_title: string | null;
};
export type WaiverInfo = {
  waiver_id: string; waiver_title: string; version_id: string; version_no: number;
  body_text: string; document_url: string | null;
};
type Result = {
  campaign_completed: boolean; reward_kind: string; reward_points: number | null;
  reward_code: string | null; reward_offer_title: string | null; submission_id?: string | null;
};
type Minor = { first: string; last: string; dob: string };

const CONSENT = "I have read and understand this waiver, I am signing it voluntarily, and I agree to be bound by its terms.";

/** Years between a yyyy-mm-dd string and today. Null when unparseable. */
function ageFrom(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function WaiverSignClient({
  business, membershipId, defaultName, campaign, waiver, alreadySignedCurrent,
  gateMode = false, minorsEnabled = true, awaitingGuardianEmail = null,
}: {
  business: Business;
  membershipId: string | null;
  defaultName: string;
  campaign: CampaignInfo | null;
  waiver: WaiverInfo | null;
  alreadySignedCurrent: boolean;
  /** CP-137: rendered in place of the app because a waiver is required. */
  gateMode?: boolean;
  minorsEnabled?: boolean;
  /** CP-137: a guardian request is already out to this address. */
  awaitingGuardianEmail?: string | null;
}) {
  const router = useRouter();
  const appBase = useAppBase(business.slug);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  const [name, setName] = useState(defaultName);
  const [dob, setDob] = useState("");
  const [who, setWho] = useState<"self" | "minors">("self");
  const [minors, setMinors] = useState<Minor[]>([{ first: "", last: "", dob: "" }]);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [sig, setSig] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);

  /**
   * CP-144: the form is a sequence now, not a wall.
   *
   * The old screen put the document, the name, the date of birth, the
   * who-does-this-cover toggle, the minor rows, the signature pad and the
   * consent box on one scroll. Every field was visible before any of them
   * were relevant, and the single Sign button sat greyed out with no
   * explanation of which of the seven inputs was missing.
   *
   * ROLLER's flow is the model: ask one thing, confirm, ask the next. Each
   * step gates its own one or two fields, so "Continue" is always obviously
   * blocked by something on screen rather than something below the fold.
   */
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");

  // The signed copy has to reach them — E-SIGN expects the signer to be able
  // to keep one. Until CP-144 sign_waiver_v2 took no email at all: it read
  // profiles.email off the session and stored that, so the copy always went to
  // the ACCOUNT address — frequently a parent's login, or whatever they typed
  // at a kiosk two years ago. CP-144 adds p_signer_email; we pre-fill from the
  // account so the common case is one tap, and let them correct it.
  useEffect(() => {
    let cancelled = false;
    createClient().auth.getUser().then(({ data }) => {
      if (!cancelled && data.user?.email) setEmail(e => e || data.user!.email!);
    });
    return () => { cancelled = true; };
  }, []);

  // CP-137: in gate mode the layout renders us instead of whatever page the
  // customer asked for — including /app/waiver?c=<promo>. The campaign slug
  // would otherwise be dropped on the floor and the welcome reward never
  // issued, so we recover it the same way CampaignResumer does and hand it
  // to sign_waiver_v2, which does the rest.
  const [gateCampaignSlug, setGateCampaignSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!gateMode || campaign) return;
    setGateCampaignSlug(campaignFromLocation() ?? readCampaign(business.slug));
  }, [gateMode, campaign, business.slug]);

  // Guardian path state.
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianSent, setGuardianSent] = useState<string | null>(awaitingGuardianEmail);
  // CP-141
  const [guardianToken, setGuardianToken] = useState<string | null>(null);
  const [mailFailed, setMailFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);   // CP-141.1

  const age = ageFrom(dob);
  const isMinorSigner = age !== null && age < 18;

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

  const cleanMinors = minors
    .map(m => ({ first: m.first.trim(), last: m.last.trim(), dob: m.dob }))
    .filter(m => m.first || m.last);
  const minorsValid = who === "self" || (cleanMinors.length > 0 && cleanMinors.every(m => m.first && m.last));

  const canSign = !!waiver && !!membershipId && name.trim().length >= 2 && agree
    && age !== null && age >= 18 && minorsValid
    && (mode === "draw" ? !!sig : typed.trim().length >= 2);

  async function sign() {
    if (!waiver || !canSign) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("sign_waiver_v2", {
      p_business_id: business.id,
      p_waiver_id: waiver.waiver_id,
      p_version_id: waiver.version_id,
      p_signer_name: name.trim(),
      p_signer_dob: dob,
      p_relationship: who === "minors" ? "guardian" : "self",
      p_minors: who === "minors" ? cleanMinors : [],
      p_signature_data_url: mode === "draw" ? sig : null,
      p_signature_typed: mode === "type" ? typed.trim() : null,
      p_consent_text: CONSENT,
      p_campaign_slug: campaign?.slug ?? gateCampaignSlug,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      p_signer_email: email.trim() || null,   // CP-144
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Result;
    forgetCampaign(business.slug);
    setResult(row);
    // Emailed copy — E-SIGN says the signer has to be able to keep one.
    // Best effort: a failure here must never cost them the signature.
    if (row?.submission_id) {
      fetch("/api/waivers/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: row.submission_id }),
      }).catch(() => { /* ignore */ });
    }
  }

  async function askGuardian() {
    if (!waiver) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_guardian_signature", {
      p_business_id: business.id,
      p_waiver_id: waiver.waiver_id,
      p_guardian_email: guardianEmail.trim(),
      p_minor_name: name.trim(),
      p_minor_dob: dob || null,
    });
    if (error) { setBusy(false); setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; token: string };
    // CP-141: hold the token so the member can resend without minting a
    // second request row.
    setGuardianToken(row.token);
    const ok = await sendGuardianInvite(row.token);
    setBusy(false);
    if (!ok) {
      // The request IS saved and the front desk can still sign them in —
      // say so, rather than implying the whole thing failed.
      setMailFailed(true);
      setGuardianSent(guardianEmail.trim());
      return;
    }
    setMailFailed(false);
    setGuardianSent(guardianEmail.trim());
  }

  /** CP-141: POST the invite. Returns whether the email actually went out. */
  async function sendGuardianInvite(token: string): Promise<boolean> {
    const res = await fetch("/api/waivers/guardian-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, businessId: business.id }),
    }).catch(() => null);
    return !!res && res.ok;
  }

  /** CP-141: resend to the same guardian, same request. */
  async function resendGuardian() {
    if (!guardianToken || resending) return;
    setResending(true); setCheckMsg(null);
    const [ok] = await Promise.all([
      sendGuardianInvite(guardianToken),
      new Promise(r => setTimeout(r, 600)),   // let the spinner be seen
    ]);
    setResending(false);
    setMailFailed(!ok);
    setCheckMsg(ok ? "Sent again — check the inbox and the spam folder." : null);
  }

  /**
   * CP-141.1: back out of the guardian path.
   *
   * CP-137's gate is a deliberate dead end — pending request means the app
   * renders the waiting screen INSTEAD of the app, with nothing else to tap.
   * Right for a real minor, a trap for an adult who hit the wrong button.
   * This cancels the request server-side (the gate then reads
   * needs_signature again) and drops them back on the signing form.
   *
   * It is not a bypass: the form still refuses an under-18 date of birth,
   * in the client AND in sign_waiver_v2().
   */
  async function cancelGuardian() {
    if (cancelling) return;
    const ok = window.confirm(
      "Go back and sign this yourself?\n\n" +
      "The link we emailed will stop working. You can always ask a parent again.",
    );
    if (!ok) return;
    setCancelling(true); setCheckMsg(null); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_guardian_request", {
      p_business_id: business.id,
    });
    setCancelling(false);
    if (error) { setErr(error.message); return; }
    // Clear the local screen AND re-read the gate, which now says
    // needs_signature, so the signing form comes back in gate mode too.
    setGuardianSent(null);
    setGuardianToken(null);
    setMailFailed(false);
    router.refresh();
  }

  /**
   * CP-141: actually ASK whether the parent has signed instead of blindly
   * refreshing. router.refresh() gives no feedback at all, so a member who
   * taps it sees nothing happen and taps it again.
   */
  async function recheckGate() {
    if (checking) return;
    setChecking(true); setCheckMsg(null);
    const supabase = createClient();
    const [res] = await Promise.all([
      supabase.rpc("my_waiver_gate", { p_business_id: business.id }),
      new Promise(r => setTimeout(r, 650)),   // minimum visible spin
    ]);
    const gate = (Array.isArray(res.data) ? res.data[0] : res.data) as { state?: string } | null;
    setChecking(false);
    if (gate?.state === "ok") { router.refresh(); return; }
    setCheckMsg("Not signed yet — we checked just now.");
  }

  function goHome() {
    const pts = result?.campaign_completed && result.reward_kind === "points" ? result.reward_points ?? 0 : 0;
    // In gate mode the layout itself re-checks — a refresh is what opens the app.
    if (gateMode) { router.refresh(); return; }
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
          {waiver && <p className="text-sm text-zinc-500 mt-1">We&apos;ve recorded it — staff can see it at the front desk, and a copy is on its way to your email.</p>}

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

  // ── waiting on a parent ──────────────────────────────────────────────
  if (guardianSent) {
    return (
      <div className="p-4 pt-8">
        <div className="rounded-3xl bg-white border shadow-sm p-6 text-center">
          <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center" style={{ background: `${primary}15` }}>
            <MailCheck className="h-8 w-8" style={{ color: primary }} />
          </div>
          <h1 className="text-xl font-black mt-4 text-zinc-900">
            {mailFailed ? "We saved your request" : "Sent to your parent or guardian"}
          </h1>

          {/* CP-141: when the email genuinely did not go out, say so. The
              old screen claimed success either way, so a minor could wait
              days for a message that was never sent. */}
          {mailFailed ? (
            <>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-900">
                  We couldn&apos;t get the email out to{" "}
                  <span className="font-semibold">{guardianSent}</span> just now. Your request is saved — try
                  sending again, or ask the front desk to sign you in when you get there.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500 mt-2">
              We emailed <span className="font-semibold text-zinc-700">{guardianSent}</span> a link to read and sign
              {business.name ? ` ${business.name}'s` : " the"} waiver for you. As soon as they sign, this unlocks.
            </p>
          )}

          <p className="text-xs text-zinc-400 mt-3">The link is good for 14 days. You can also just ask the front desk when you get there.</p>

          <Button
            variant="outline"
            className="w-full h-11 mt-5"
            onClick={recheckGate}
            disabled={checking}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "They've signed — check again"}
          </Button>

          {/* CP-141: resending reuses the SAME request row, so the link the
              parent already has keeps working. */}
          {guardianToken && (
            <Button
              variant="ghost"
              className="w-full h-10 mt-2 text-zinc-500"
              onClick={resendGuardian}
              disabled={resending}
            >
              <Send className={`h-3.5 w-3.5 mr-2 ${resending ? "animate-pulse" : ""}`} />
              {resending ? "Sending…" : "Send the email again"}
            </Button>
          )}

          {checkMsg && <p className="text-xs text-zinc-500 mt-2">{checkMsg}</p>}
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

          {/* CP-141.1: the way out. Without this an adult who mis-tapped the
              guardian button is locked out of the app entirely, with no
              screen to navigate to and no button to press. */}
          <button
            onClick={cancelGuardian}
            disabled={cancelling}
            className="mt-4 text-xs text-zinc-500 underline underline-offset-2 disabled:opacity-50 inline-flex items-center gap-1 mx-auto"
          >
            <ArrowLeft className="h-3 w-3" />
            {cancelling ? "Going back…" : "Wrong button? Go back and sign it myself"}
          </button>
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
  // Steps are computed, not hard-coded: a business with minors turned off
  // never sees the "who does this cover" step at all, so the dots stay
  // honest about how much is left.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const detailsOk = name.trim().length >= 2 && !!dob && age !== null && age >= 18 && age <= 120;
  const coverOk = who === "self" || (cleanMinors.length > 0 && cleanMinors.every(m => m.first && m.last));

  type StepId = "email" | "details" | "cover" | "sign";
  const stepIds: StepId[] = minorsEnabled
    ? ["email", "details", "cover", "sign"]
    : ["email", "details", "sign"];
  const current = stepIds[Math.min(step, stepIds.length - 1)];
  const lastIndex = stepIds.length - 1;

  const stepReady =
    current === "email"   ? emailOk
    : current === "details" ? detailsOk
    : current === "cover"   ? coverOk
    : canSign;

  // Why "Continue" is blocked, named. The old screen made you guess.
  const blockedBecause =
    current === "email"   ? "Enter an email we can send your copy to"
    : current === "details" ? (name.trim().length < 2 ? "Enter your full legal name" : !dob ? "Enter your date of birth" : "Check your date of birth")
    : current === "cover"   ? "Every child needs a first and last name"
    : (mode === "draw" && !sig) ? "Add your signature"
      : (mode === "type" && typed.trim().length < 2) ? "Type your full name as your signature"
      : !agree ? "Tick the box to agree"
      : "Finish the details above";

  const stepTitle =
    current === "email"   ? "Your email"
    : current === "details" ? "Your details"
    : current === "cover"   ? "Who does this cover?"
    : waiver.waiver_title;

  function next() { setErr(null); setStep(s => Math.min(s + 1, lastIndex)); }
  function back() { setErr(null); setStep(s => Math.max(s - 1, 0)); }

  return (
    <div className="p-4 pt-5 pb-10">
      {gateMode && (
        <div className="rounded-2xl border bg-amber-50 border-amber-200 p-3.5 mb-4">
          <div className="text-sm font-black text-amber-900">One thing before you start</div>
          <p className="text-[13px] text-amber-800 mt-0.5">
            {business.name} needs this waiver signed before you can use the app.
          </p>
        </div>
      )}

      {campaign && step === 0 && (
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

      {alreadySignedCurrent && !gateMode && step === 0 && (
        <div className="rounded-2xl border bg-emerald-50 border-emerald-200 p-3 text-sm text-emerald-800 mb-4">
          You&apos;ve already signed the current version of this waiver. Signing again is fine — it just adds a fresh record.
        </div>
      )}

      <div className="rounded-3xl bg-white border shadow-sm overflow-hidden">
        {/* Progress. Dots rather than "Step 2 of 4" — the count is visible
            without making four feel like a lot. */}
        <div className="px-5 pt-5">
          <div className="flex items-center gap-1.5">
            {stepIds.map((id, i) => (
              <div key={id} className="h-1.5 flex-1 rounded-full transition-all"
                style={{ background: i <= step ? primary : "#E4E4E7" }} />
            ))}
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-3">
            {business.name} · version {waiver.version_no}
          </div>
          <h1 className="text-xl font-black text-zinc-900 mt-1">{stepTitle}</h1>
        </div>

        <div className="px-5 mt-4 space-y-4">
          {/* ── 1. email ─────────────────────────────────────────────── */}
          {current === "email" && (
            <div>
              <p className="text-[13px] text-zinc-600 -mt-1 mb-3">
                We&apos;ll send your signed copy here so you have it on record.
              </p>
              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Email address</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" className="mt-1.5 h-12 text-base" autoComplete="email" inputMode="email" />
            </div>
          )}

          {/* ── 2. details ───────────────────────────────────────────── */}
          {current === "details" && (
            <>
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Your full legal name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="First and last name"
                  className="mt-1.5 h-12 text-base" autoComplete="name" />
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Your date of birth</label>
                <Input type="date" value={dob} onChange={e => setDob(e.target.value)}
                  className="mt-1.5 h-12 text-base" autoComplete="bday" />
              </div>

              {/* Under 18 is terminal: no self-attest button exists anywhere
                  in this flow, by design. */}
              {isMinorSigner && (
                <div className="rounded-2xl border p-4" style={{ borderColor: `${primary}55`, background: `${primary}08` }}>
                  <div className="text-sm font-black text-zinc-900">Ask a parent or guardian to sign</div>
                  <p className="text-[12.5px] text-zinc-600 mt-1">
                    We&apos;ll email them the waiver. They read and sign it, and your account unlocks — you don&apos;t sign anything here.
                  </p>
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mt-3 block">Their email</label>
                  <Input type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)}
                    placeholder="parent@example.com" className="mt-1.5 h-11" autoComplete="off" />
                  {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
                  <Button onClick={askGuardian}
                    disabled={busy || name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(guardianEmail.trim())}
                    className="w-full h-11 mt-3 font-bold text-white" style={{ background: primary }}>
                    {busy ? "Sending…" : "Send it to them"}
                  </Button>
                  <p className="text-[10.5px] text-zinc-400 mt-2">
                    Or bring a parent to the front desk — staff can sign you in there.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── 3. who it covers ─────────────────────────────────────── */}
          {current === "cover" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setWho("self")}
                  className={`h-14 rounded-xl border-2 text-sm font-bold transition ${who === "self" ? "text-white" : "bg-white text-zinc-600 border-zinc-200"}`}
                  style={who === "self" ? { background: primary, borderColor: primary } : undefined}>
                  Just me
                </button>
                <button type="button" onClick={() => setWho("minors")}
                  className={`h-14 rounded-xl border-2 text-sm font-bold transition ${who === "minors" ? "text-white" : "bg-white text-zinc-600 border-zinc-200"}`}
                  style={who === "minors" ? { background: primary, borderColor: primary } : undefined}>
                  Me and my kids
                </button>
              </div>

              {who === "minors" && (
                <div className="space-y-3">
                  {minors.map((m, i) => (
                    <div key={i} className="rounded-xl border p-3 bg-zinc-50/60">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Child {i + 1}</div>
                        {minors.length > 1 && (
                          <button type="button" className="text-zinc-400 hover:text-zinc-600"
                            onClick={() => setMinors(minors.filter((_, j) => j !== i))} aria-label={`Remove child ${i + 1}`}>
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input placeholder="First name" value={m.first}
                          onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, first: e.target.value } : x))} className="h-10" />
                        <Input placeholder="Last name" value={m.last}
                          onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, last: e.target.value } : x))} className="h-10" />
                      </div>
                      <Input type="date" value={m.dob} aria-label={`Child ${i + 1} date of birth`}
                        onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, dob: e.target.value } : x))} className="h-10 mt-2" />
                    </div>
                  ))}
                  {minors.length < 12 && (
                    <button type="button" onClick={() => setMinors([...minors, { first: "", last: "", dob: "" }])}
                      className="w-full h-10 rounded-xl border-2 border-dashed text-sm font-bold text-zinc-500 inline-flex items-center justify-center gap-1.5">
                      <Plus className="h-4 w-4" /> Add another child
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 4. the document, then the signature ──────────────────── */}
          {current === "sign" && (
            <>
              <p className="text-[13px] text-zinc-600 -mt-1">Please read the whole document before signing.</p>
              <div
                className="max-h-64 overflow-y-auto rounded-xl border bg-zinc-50 p-4 text-[13px] leading-relaxed text-zinc-800 whitespace-pre-line"
                onScroll={(e) => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight >= t.scrollHeight - 8) setScrolledEnd(true); }}
              >
                {waiver.body_text}
              </div>
              {waiver.document_url && (
                <a href={waiver.document_url} target="_blank" rel="noreferrer"
                  className="inline-block text-xs font-semibold underline" style={{ color: primary }}>
                  Open the full document
                </a>
              )}
              {!scrolledEnd && <div className="text-[11px] text-zinc-400">Scroll to the end ↓</div>}

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
                <span className="text-[12.5px] leading-snug text-zinc-700">
                  {CONSENT}
                  {who === "minors" && " I am the parent or legal guardian of the children named above and I am signing on their behalf."}
                </span>
              </label>

              {err && <p className="text-sm text-red-600">{err}</p>}
              {!membershipId && <p className="text-sm text-amber-700">Finish creating your account first, then come back to sign.</p>}
            </>
          )}
        </div>

        {/* ── navigation ───────────────────────────────────────────── */}
        <div className="p-5">
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={back} disabled={busy} className="h-14 px-5 font-bold">
                Back
              </Button>
            )}
            {/* Under 18: the guardian block above IS the step. No forward
                button exists for them anywhere in this flow, by design. */}
            {!isMinorSigner && (
              current === "sign" ? (
              <Button onClick={sign} disabled={!canSign || busy}
                  className="flex-1 h-14 text-base font-black text-white" style={{ background: primary }}>
                  {busy ? "Recording…" : campaign && rewardLine ? `Sign & claim ${rewardLine}` : "Sign waiver"}
                </Button>
              ) : (
                <Button onClick={next} disabled={!stepReady}
                  className="flex-1 h-14 text-base font-black text-white" style={{ background: primary }}>
                  Continue
                </Button>
              )
            )}
          </div>
          {!isMinorSigner && !stepReady && (
            <p className="text-[11.5px] text-zinc-500 text-center mt-2">{blockedBecause}</p>
          )}
          {!isMinorSigner && current === "sign" && (
            <p className="text-[10.5px] text-zinc-400 text-center mt-2">
              Your signature, name, date of birth{who === "minors" ? ", the children you named" : ""} and the time are stored with
              version {waiver.version_no} of this document and are visible to {business.name} staff.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
