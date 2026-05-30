"use client";
/**
 * AcceptInvitationClient — CP-41
 *
 * Three branches based on auth + email-match:
 *   • not signed in       → signup form (email locked to invited email)
 *   • signed in & matches → "Accept invitation" button
 *   • signed in & differs → "sign out and start over" message
 *
 * In all cases, after the user lands authenticated as the invited
 * email, we call /api/team/accept to claim the invitation row and
 * route to the right dashboard.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Shield, Loader2, X, Mail, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type Preview = {
  email: string;
  role: "agency_admin" | "business_manager" | "business_staff";
  business_id: string | null;
  business_name: string | null;
  expires_at: string;
  is_expired: boolean;
  is_accepted: boolean;
  is_revoked: boolean;
};

export function AcceptInvitationClient({
  token, preview, signedInEmail,
}: {
  token: string;
  preview: Preview;
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Signup form state (only used when !signedInEmail)
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  // ── Guard rails on the invite itself ────────────────────────────
  if (preview.is_revoked) {
    return <DeadInviteCard reason="This invitation was revoked." />;
  }
  if (preview.is_accepted) {
    return <DeadInviteCard reason="This invitation has already been accepted. If you've lost access, ask whoever invited you to send a new one." />;
  }
  if (preview.is_expired) {
    return <DeadInviteCard reason="This invitation has expired. Ask whoever invited you to send a fresh link." />;
  }

  const emailMatches =
    signedInEmail && signedInEmail.toLowerCase() === preview.email.toLowerCase();

  /** Call the accept API + route to the right dashboard. */
  async function claimAndRoute() {
    const res = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not accept invitation");

    toast.success("You're in!");

    let to = "/agency";
    if (json.role !== "agency_admin" && json.business_id) {
      const supabase = createClient();
      const { data } = await supabase
        .from("businesses")
        .select("slug")
        .eq("id", json.business_id)
        .maybeSingle();
      const slug = (data as { slug?: string } | null)?.slug;
      if (slug) to = `/${slug}/manage`;
    }
    setTimeout(() => router.push(to), 400);
  }

  /** Branch 1: NOT signed in → sign up with locked email + set password. */
  async function signupAndAccept() {
    if (!fullName.trim() || password.length < 8) {
      setErr("Name required and password must be at least 8 characters.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signUp({
        email: preview.email,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (signErr) throw signErr;
      // Auto sign-in if Supabase is set to confirm-off (recommended for this flow).
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: preview.email,
        password,
      });
      if (loginErr) throw loginErr;
      await claimAndRoute();
    } catch (e: any) {
      setErr(e?.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  /** Branch 2: signed in + email matches → just accept. */
  async function acceptOnly() {
    setBusy(true); setErr(null);
    try {
      await claimAndRoute();
    } catch (e: any) {
      setErr(e?.message ?? "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  /** Branch 3: signed in but wrong email → sign them out so they can restart. */
  async function signOutAndRestart() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  const roleLabel = labelForRole(preview.role);
  const scopeLabel = preview.business_name
    ? ` for ${preview.business_name}`
    : "";

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg overflow-hidden">
        <div className="p-6 text-center border-b">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mb-4">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold">You've been invited to Atlas</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-snug">
            as <strong className="text-zinc-800">{roleLabel}</strong>{scopeLabel}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-xs">
            <Mail className="h-3 w-3 text-zinc-500" />
            <span className="font-semibold text-zinc-800">{preview.email}</span>
          </div>
        </div>

        {err && (
          <div className="mx-6 mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
            <X className="h-4 w-4 mt-0.5 shrink-0" /> {err}
          </div>
        )}

        {/* ── Branch 3: signed in but wrong email ─────────────────── */}
        {signedInEmail && !emailMatches && (
          <div className="p-6 space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">Wrong account</div>
                <div className="mt-1 text-xs">
                  You're signed in as <strong>{signedInEmail}</strong>, but this invite is for <strong>{preview.email}</strong>. Sign out and either log in or sign up with the invited email.
                </div>
              </div>
            </div>
            <Button onClick={signOutAndRestart} className="w-full h-12 text-base font-bold bg-zinc-900 hover:bg-zinc-800 text-white">
              Sign out and restart
            </Button>
          </div>
        )}

        {/* ── Branch 2: signed in & matches → simple accept ────────── */}
        {emailMatches && (
          <div className="p-6 space-y-2">
            <p className="text-sm text-zinc-600 text-center mb-3">
              You're signed in with the right email. Tap below to claim your spot.
            </p>
            <Button
              onClick={acceptOnly}
              disabled={busy}
              className="w-full h-12 text-base font-bold bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              {busy
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</>
                : "Accept invitation"}
            </Button>
            <button onClick={signOutAndRestart} className="w-full text-xs text-zinc-500 hover:text-zinc-700 mt-1">
              Not you? Sign out
            </button>
          </div>
        )}

        {/* ── Branch 1: NOT signed in → sign up form ────────────────── */}
        {!signedInEmail && (
          <div className="p-6 space-y-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Your name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Johnson"
                autoFocus
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Email</Label>
              <Input
                value={preview.email}
                disabled
                className="mt-1 bg-zinc-50 text-zinc-700"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Locked to the email this invite was sent to.
              </p>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Set a password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1"
              />
            </div>
            <Button
              onClick={signupAndAccept}
              disabled={busy || !fullName.trim() || password.length < 8}
              className="w-full h-12 text-base font-bold bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              {busy
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating account…</>
                : "Create account & join"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function labelForRole(role: string): string {
  if (role === "agency_admin") return "Agency admin";
  if (role === "business_manager") return "Manager";
  if (role === "business_staff") return "Front desk";
  return role;
}

function DeadInviteCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg overflow-hidden p-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-zinc-100 text-zinc-500 flex items-center justify-center mb-4">
          <X className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-extrabold text-zinc-900">This invitation isn't usable</h1>
        <p className="text-sm text-zinc-600 mt-3 leading-relaxed">{reason}</p>
      </div>
    </div>
  );
}
