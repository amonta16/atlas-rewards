"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Gift, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CustomerSignup() {
  const router = useRouter();
  const params = useParams<{ business: string }>();
  // CP-32 go-live: read ?ref=… from window.location instead of
  // useSearchParams() — the hook bails out of static rendering and
  // breaks our production build at prerender time.
  const [refCode, setRefCode] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRefCode((new URLSearchParams(window.location.search).get("ref") ?? "").toUpperCase());
  }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // CP-36b: notification consent. Defaults to ON (opt-out model). Customer
  // can also flip individual types off later in their Profile tab.
  const [notifyConsent, setNotifyConsent] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Stash referral code so it survives the signup → email-confirm → return cycle
  useEffect(() => {
    if (refCode) sessionStorage.setItem("atlas_ref", refCode);
  }, [refCode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, phone } },
    });
    if (error) { setErr(error.message); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    let welcomeBonus = 0;
    let referralBonus = 0;
    if (user) {
      const { data: biz } = await supabase
        .from("businesses").select("id, point_rules").eq("slug", params.business).single();
      if (biz) {
        // CP-24: capture the membership id so we can confirm a referral_code
        // exists before navigating away. Prevents the "Enrolling…" QR
        // placeholder Andrew reported.
        const enroll = await supabase.rpc("enroll_member", {
          p_user_id: user.id,
          p_business_id: biz.id,
        });
        if (enroll.error) {
          // Surface the failure instead of silently sending the user to a
          // membership-less app shell.
          setErr(`Enrollment failed: ${enroll.error.message}`);
          setLoading(false);
          return;
        }
        welcomeBonus = (biz.point_rules as { first_visit_bonus?: number })?.first_visit_bonus ?? 0;

        // Process referral if a ref code was used
        const storedRef = refCode || sessionStorage.getItem("atlas_ref") || "";
        if (storedRef) {
          const { data: refResult, error: refErr } = await supabase.rpc("process_referral",
            { p_referrer_code: storedRef, p_business_id: biz.id });
          if (!refErr && refResult?.[0]) {
            referralBonus = refResult[0].referee_points ?? 0;
            sessionStorage.removeItem("atlas_ref");
          }
        }

        // CP-36b: persist notification consent. Defaults are all-on, so we
        // only write when the user explicitly opted out, to keep the table
        // sparse for opted-in users. Failure here is non-fatal — the user
        // can still flip switches from their Profile tab later.
        if (!notifyConsent) {
          await supabase.rpc("update_my_notification_preferences", {
            p_business_id: biz.id,
            p_push_enabled: false,
            p_streak_reminders: false,
            p_gift_expiration_reminders: false,
            p_customer_offer_announcements: false,
            p_check_in_available: false,
            p_we_miss_you: false,
            p_reward_unlocked: false,
            p_birthday: false,
            p_review_request: false,
          });
        }
      }
    }

    const total = welcomeBonus + referralBonus;
    router.push(total > 0 ? `/app?celebrate=${total}` : "/app");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        {refCode && (
          <div className="mb-5 rounded-xl border bg-emerald-50 border-emerald-200 p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Gift className="h-4 w-4" />
            </div>
            <div className="text-sm">
              <div className="font-semibold text-emerald-900">You were invited!</div>
              <div className="text-xs text-emerald-700">You'll earn a referral bonus when you sign up.</div>
            </div>
          </div>
        )}

        <h1 className="text-2xl font-bold tracking-tight">Join the rewards program</h1>
        <p className="text-sm text-muted-foreground mt-1">It takes 30 seconds. Earn points on your first visit.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Your name"><Input value={name} onChange={e => setName(e.target.value)} required /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
          <Field label="Phone"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" /></Field>
          <Field label="Choose a password"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} /></Field>

          {/* CP-36b: notification consent checkbox. Opt-OUT model so most
              members keep getting their streaks / offers / etc., but it's
              up-front and obvious so we have explicit consent on record. */}
          <label className="flex items-start gap-3 rounded-xl border bg-zinc-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyConsent}
              onChange={e => setNotifyConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-zinc-500" />
                Send me reward + streak notifications
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                Things like streak reminders, surprise offers, and we-miss-you nudges.
                You can change this any time from your Profile.
              </p>
            </div>
          </label>

          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating account…" : "Create my rewards account"}</Button>
        </form>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Already have an account? <Link href="/login" className="font-semibold text-brand-primary">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
