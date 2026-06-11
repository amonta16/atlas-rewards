"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, MailCheck, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirect } from "@/lib/utils";

/**
 * Customer login — CP-37.1 revision.
 *
 * Two new affordances on top of the original password-only form:
 *
 *   1. ?confirm=1 banner. The signup page now redirects here with
 *      ?confirm=1 when Supabase is configured to require email
 *      confirmation. Customers used to be silently dropped at /app
 *      with a half-built account; now they see a clear "Check your
 *      inbox" banner so they know to confirm before signing in.
 *
 *   2. "Send me a sign-in link" button. Anyone who can't remember
 *      their password — or who was created via invite / magic-link
 *      and never set one — can tap this and Supabase will email
 *      them a one-time sign-in link.  Resolves the wave of "I
 *      created an account but can't log in" reports.
 */
/**
 * CP-47: role-aware routing. A front-desk / manager / agency-admin account
 * signing in here used to land in the CUSTOMER app (the page always
 * defaulted to /app). Now we look up the user's roles and send anyone with
 * a privileged role to /<slug>/manage instead. An explicit ?next= still
 * wins (invite + /manage-guard links). Also adds a "Forgot password?" link
 * and a front-desk heading when arriving from the manage portal.
 */
async function destinationAfterAuth(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  appBase: string,
): Promise<string> {
  if (typeof window !== "undefined") {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) return safeRedirect(next, `${appBase}/app`);
  }
  // Any privileged role → front desk. Pure customers → the app.
  const { data: roles } = await supabase
    .from("business_users")
    .select("role")
    .eq("user_id", userId);
  const privileged = (roles ?? []).some(
    (r: { role: string }) =>
      r.role === "agency_admin" || r.role === "business_manager" || r.role === "business_staff",
  );
  return `${appBase}${privileged ? "/manage" : "/app"}`;
}

export default function CustomerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // CP-47: front-desk context — true when bounced here from /manage.
  const [staffContext, setStaffContext] = useState(false);
  // Slug-aware base path ("" on subdomain, "/<slug>" on path access).
  const [base, setBase] = useState("");
  // CP-37.1 — confirm-email banner shown when ?confirm=1 is set.
  const [showConfirmBanner, setShowConfirmBanner] = useState(false);
  // CP-37.1 — magic-link flow state.
  const [linkSending, setLinkSending] = useState(false);
  const [linkSent, setLinkSent] = useState<string | null>(null);

  // Pre-fill email + read ?confirm=1 from the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const prefill = sp.get("email");
    if (prefill) setEmail(prefill);
    if (sp.get("confirm") === "1") setShowConfirmBanner(true);
    // Front-desk heading when arriving from the /manage guard or ?staff=1.
    const next = sp.get("next") ?? "";
    if (sp.get("staff") === "1" || /\/manage(\/|$)/.test(next)) setStaffContext(true);
    setBase(window.location.pathname.replace(/\/login\/?$/, ""));
  }, []);

  // CP-43: if a session already exists (e.g. an agency admin who just
  // clicked "Front desk" and was bounced here by the /manage guard during
  // a cookie-refresh race), forward straight to ?next instead of making
  // them re-type a password. This is what kills the "log in → customer
  // preview → click again → finally the front desk" cycle.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      // CP-45: slug-aware default — on path-based access this page lives at
      // /<slug>/login, so a bare "/app" default 404s. Strip "/login" from the
      // current path to keep the slug prefix (subdomain: "/login" → "" → "/app").
      const appBase = window.location.pathname.replace(/\/login\/?$/, "");
      // CP-47: role-aware — privileged accounts go to /manage, not /app.
      const dest = await destinationAfterAuth(supabase, user.id, appBase);
      if (cancelled) return;
      router.replace(dest);
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // CP-37.1 — surface the most common Supabase auth errors in
      // language a customer can actually act on, instead of "Invalid
      // login credentials" for every failure mode.
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("email not confirmed")) {
        setErr("Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or tap \"Send me a sign-in link\" below.");
      } else if (msg.includes("invalid login")) {
        setErr("Wrong email or password. If you signed up via an invite, you may not have a password yet — tap \"Send me a sign-in link\" below.");
      } else {
        setErr(error.message);
      }
      setLoading(false);
      return;
    }
    // CP-47: role-aware landing. ?next= still wins (invite + /manage-guard
    // links); otherwise privileged accounts go to /manage, customers to /app.
    let appBase = "";
    if (typeof window !== "undefined") {
      appBase = window.location.pathname.replace(/\/login\/?$/, "");
    }
    const { data: { user } } = await supabase.auth.getUser();
    const dest = user
      ? await destinationAfterAuth(supabase, user.id, appBase)
      : `${appBase}/app`;
    router.push(dest);
    router.refresh();
  }

  // CP-37.1 — magic-link fallback. Works whether or not the user has
  // a password set, AND auto-confirms the email if Supabase Auth has
  // confirmation enabled — so this is a one-button rescue for every
  // common signup-broke-mid-way failure mode.
  async function sendMagicLink() {
    if (!email) {
      setErr("Enter your email first, then tap the sign-in link button.");
      return;
    }
    setLinkSending(true);
    setErr(null);
    const supabase = createClient();
    // CP-37.5: pass ?next through to the magic-link redirect so the
    // post-confirm landing is /<slug>/manage for managers / front-desk.
    let next: string | null = null;
    if (typeof window !== "undefined") {
      next = new URLSearchParams(window.location.search).get("next");
    }
    const dest = safeRedirect(next, "/app");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}${dest}`
            : undefined,
      },
    });
    setLinkSending(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setLinkSent(email);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        {staffContext && (
          <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
            <Shield className="h-3 w-3" /> Front desk
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight">
          {staffContext ? "Front desk sign-in" : "Welcome back"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {staffContext
            ? "Sign in to run the front desk for this business."
            : "Sign in to check your points and rewards."}
        </p>

        {showConfirmBanner && !linkSent && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-emerald-900">Almost there — check your inbox</div>
              <p className="text-xs text-emerald-700 mt-0.5 leading-snug">
                We sent you a confirmation link. Tap it to finish creating your account, then come back here to sign in.
              </p>
            </div>
          </div>
        )}

        {linkSent && (
          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-sky-900">Sign-in link sent</div>
              <p className="text-xs text-sky-700 mt-0.5 leading-snug">
                Check <strong>{linkSent}</strong> — tap the link in the email to sign in. You can close this tab.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Password</Label>
              <Link href={`${base}/forgot-password`} className="text-xs font-semibold text-brand-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        </form>

        {/* CP-37.1: one-tap rescue. */}
        <div className="mt-4 pt-4 border-t">
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={linkSending || !email}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-zinc-700 hover:text-zinc-900 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            {linkSending ? "Sending…" : "Send me a sign-in link instead"}
          </button>
          <p className="text-[11px] text-zinc-500 text-center mt-1.5 leading-snug">
            Forgot your password, or signed up via invite? Tap above — we'll email you a one-time sign-in link.
          </p>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          New here? <Link href="/signup" className="font-semibold text-brand-primary">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
