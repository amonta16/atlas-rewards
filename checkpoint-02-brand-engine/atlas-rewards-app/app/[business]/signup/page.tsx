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
  // CP-46: birthday captures MONTH + DAY only — we don't care what year
  // the customer was born. Stored as a real date (sentinel year 2000) so
  // the Birthday automated offer, which matches on month/day, keeps working.
  const [bMonth, setBMonth] = useState("");  // "01".."12"
  const [bDay, setBDay] = useState("");      // "01".."31"
  const birthday = bMonth && bDay ? `2000-${bMonth}-${bDay}` : "";
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
    // CP-46: every field is required and validated before we hit Supabase,
    // so we never create a half-filled account.
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name.trim())            { setErr("Please enter your name."); return; }
    if (!emailOk)                { setErr("Please enter a valid email address."); return; }
    if (phoneDigits.length < 10) { setErr("Please enter a valid phone number."); return; }
    if (!bMonth || !bDay)        { setErr("Please pick your birthday month and day."); return; }
    if (!isValidMonthDay(bMonth, bDay)) { setErr("That day doesn't exist for the month you picked."); return; }
    if (password.length < 6)     { setErr("Password must be at least 6 characters."); return; }
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { data: signupData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, phone, birthday } },
    });
    if (error) {
      // CP-37.18: if the customer already has an Atlas account from
      // ANOTHER business in the same system, signUp errors with
      // "User already registered." That used to dead-end them. Now we
      // try signInWithPassword — if the password they typed matches
      // their existing account, we sign them in and enroll them for
      // THIS business below. If the password is wrong, surface a
      // clearer message + magic-link rescue.
      const msg = String(error.message || "").toLowerCase();
      const looksLikeExisting =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (looksLikeExisting) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email, password,
        });
        if (signInErr) {
          setErr(
            "You already have an Atlas account with this email at another business. Sign in there first, or use \"Send me a sign-in link\" on the login page if you forgot the password.",
          );
          setLoading(false);
          return;
        }
        // Sign-in worked — fall through. The enroll_member call below
        // will attach this business to the existing account.
      } else {
        setErr(error.message);
        setLoading(false);
        return;
      }
    }

    // CP-37.1: detect "email confirmation required" — when Supabase has
    // Confirm-email enabled, signUp returns a user but NO session, and
    // every subsequent call (enroll_member, profiles upsert) silently
    // fails because auth.uid() is null. The customer ends up with a
    // half-built account they can't sign in to. Bail out early with a
    // clear "check your email" message so they don't think the button
    // is broken.
    if (signupData?.user && !signupData?.session) {
      setLoading(false);
      setErr(null);
      // CP-45: slug-aware — on path-based access this page is /<slug>/signup,
      // so a bare "/login" would lose the slug and 404.
      router.push(
        `${window.location.pathname.replace(/\/signup\/?$/, "")}/login?email=${encodeURIComponent(email)}&confirm=1`
      );
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    // CP-42: also persist birthday onto the profiles row so the rest of
    // the app (Birthday offers, profile tab) can read it without
    // round-tripping through auth.users.user_metadata.
    if (user) {
      try {
        await supabase.from("profiles").upsert({
          id: user.id,
          full_name: name.trim(),
          phone: phone || null,
          birthday: birthday || null,
        }, { onConflict: "id" });
      } catch { /* non-fatal */ }
    }
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
    // CP-45: slug-aware app path (works on both subdomain and /<slug> access).
    const appBase = `${window.location.pathname.replace(/\/signup\/?$/, "")}/app`;
    router.push(total > 0 ? `${appBase}?celebrate=${total}` : appBase);
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
          <Field label="Phone"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" required /></Field>
          {/* CP-46: birthday is MONTH + DAY only — powers Birthday automated
              offers without asking the customer's age/year. set-once: once
              saved, it can't be changed later (CP-28 server-side trigger). */}
          <Field label="Your birthday">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={bMonth}
                onChange={e => { setBMonth(e.target.value); setBDay(""); }}
                required
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="" disabled>Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
                ))}
              </select>
              <select
                value={bDay}
                onChange={e => setBDay(e.target.value)}
                required
                disabled={!bMonth}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="" disabled>Day</option>
                {Array.from({ length: bMonth ? daysInMonth(bMonth) : 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              We only need the month and day to send you a birthday reward. Can't be changed later — pick carefully.
            </p>
          </Field>
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
          {/* CP-45: slug-prefixed so the link works on path-based access too.
              On the subdomain, middleware skips the double-prefix and routes
              /<slug>/login to the same page. */}
          Already have an account? <Link href={`/${params.business}/login`} className="font-semibold text-brand-primary">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Sentinel year 2000 is a leap year, so Feb 29 is allowed.
function daysInMonth(mm: string): number {
  const m = parseInt(mm, 10);
  if (!m) return 31;
  return new Date(2000, m, 0).getDate();
}

function isValidMonthDay(mm: string, dd: string): boolean {
  const d = parseInt(dd, 10);
  return d >= 1 && d <= daysInMonth(mm);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
