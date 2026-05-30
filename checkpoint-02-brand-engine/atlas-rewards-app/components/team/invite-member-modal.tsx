"use client";
/**
 * InviteMemberModal — CP-31 / CP-32 / CP-36
 *
 * Email + role select. The role options are filtered by what the caller
 * is allowed to invite. The actual permission check happens server-side
 * in the create_invitation RPC — this UI just hides options the user
 * couldn't successfully invite anyway.
 *
 * CP-32: when an agency_admin is on the agency Team page (businessId is
 * null), they can now ALSO invite a manager or front-desk for a specific
 * sub-account by picking it from a "Which business?" dropdown.
 *
 * CP-36 changes:
 *   • Role gating tightened: business_staff (front desk) shows NO Invite
 *     UI at all (handled by team-members.tsx). business_manager can invite
 *     business_manager + business_staff for their own business — they
 *     cannot create agency_admins.
 *   • Email sending is removed. The RPC just mints a token and we render
 *     a copy-link in place. Faster, fewer moving parts, and dodges the
 *     "magic-link email never arrives" issue entirely.
 */

import { useEffect, useState } from "react";
import { X, Send, Crown, Shield, User, Loader2, Mail, Building2, Copy, Check, Link as LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type Role = "agency_admin" | "business_manager" | "business_staff";
type BizPick = { id: string; name: string };

const ROLE_DEFS: Record<Role, { label: string; description: string; icon: typeof Crown }> = {
  agency_admin: {
    label: "Agency admin",
    description: "Full access to every sub-account, billing, and the agency dashboard.",
    icon: Crown,
  },
  business_manager: {
    label: "Manager",
    description: "Can run this business's day-to-day: insights, billing, offers, team.",
    icon: Shield,
  },
  business_staff: {
    label: "Front desk",
    description: "Limited access: scan members, award points, fulfill redemptions.",
    icon: User,
  },
};

export function InviteMemberModal({
  businessId,
  callerRole,
  primary,
  onClose,
  onInvited,
}: {
  businessId: string | null;
  callerRole: Role;
  primary: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  // CP-42: admin sets the password directly. No more "user types their
  // own password during signup" — that broke when Supabase already had
  // the email in auth.users. We pre-create the auth user with this
  // password via /api/team/create-account.
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(() => {
    if (callerRole === "business_manager") return "business_staff";
    if (callerRole === "agency_admin" && businessId !== null) return "business_staff";
    return "business_manager";
  });
  const [busy, setBusy] = useState(false);
  // CP-42: result panel — clean sign-in URL + the credentials Andrew
  // can paste into his message to the invitee.
  const [result, setResult] = useState<
    | { url: string; email: string; password: string; createdNew: boolean }
    | null
  >(null);
  const [copied, setCopied] = useState<"url" | "creds" | null>(null);

  // CP-32: when the agency admin is on the agency Team page (businessId
  // prop is null), they can pick which sub-account to invite a manager
  // / front-desk into. We load the list of businesses lazily here.
  const [businesses, setBusinesses] = useState<BizPick[] | null>(null);
  const [pickedBusinessId, setPickedBusinessId] = useState<string | "">("");
  const isAgencyFromAgency = callerRole === "agency_admin" && businessId === null;

  useEffect(() => {
    if (!isAgencyFromAgency) return;
    const supabase = createClient();
    supabase
      .from("businesses")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setBusinesses((data ?? []) as BizPick[]));
  }, [isAgencyFromAgency]);

  // What roles can the caller actually invite?
  // CP-36: locked-down role matrix per Andrew's spec —
  //   agency_admin     → any of the three (existing behavior)
  //   business_manager → can invite co-managers + front desk for THEIR
  //                      business (was: front desk only). NEVER admins.
  //   business_staff   → nothing. They shouldn't even see the modal —
  //                      team-members.tsx hides the Invite button — but
  //                      this empty array is the belt-and-suspenders fallback.
  const allowed: Role[] = (() => {
    if (callerRole === "agency_admin") return ["agency_admin", "business_manager", "business_staff"];
    if (callerRole === "business_manager") return ["business_manager", "business_staff"];
    return [];
  })();

  async function send() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email"); return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters"); return;
    }
    const effectiveBusinessId = role === "agency_admin"
      ? null
      : (businessId ?? (pickedBusinessId || null));
    if (role !== "agency_admin" && !effectiveBusinessId) {
      toast.error("Pick which business this person joins"); return;
    }
    setBusy(true);
    try {
      // CP-42: NEW route — admin pre-creates the account with email +
      // password. No token, no acceptance step, no expiry. Returns a
      // direct sign-in URL.
      const res = await fetch("/api/team/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role,
          business_id: effectiveBusinessId,
          full_name: fullName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "create account failed");

      setResult({
        url: json.sign_in_url as string,
        email: json.email as string,
        password,
        createdNew: !!json.created_new,
      });
      toast.success(json.created_new ? "Account created" : "Role attached to existing account");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(what: "url" | "creds", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  }

  function handleDone() {
    setResult(null);
    setCopied(null);
    setEmail("");
    setPassword("");
    setFullName("");
    onInvited();
  }

  // Tiny password generator — admin can tap it instead of typing one.
  function genPassword() {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 12; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    setPassword(out);
  }

  // ── CP-42: account-created success view ──────────────────────────────
  // Andrew sets email + password himself; this panel shows the credentials
  // + sign-in link so he can paste both into his message to the invitee.
  if (result) {
    const credsBlock =
      `Email: ${result.email}\nPassword: ${result.password}\nSign-in: ${result.url}`;
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <LinkIcon className="h-4 w-4" style={{ color: primary }} />
              {result.createdNew ? "Account created" : "Role attached"}
            </h2>
            <button onClick={handleDone} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-zinc-600">
              Send these credentials + the sign-in link to <b>{result.email}</b>. They'll log in and land straight in their portal — no token or expiry.
            </p>

            {/* Credentials block — easy paste */}
            <div className="rounded-xl border bg-zinc-50 p-3 text-[12px] font-mono text-zinc-800 whitespace-pre-wrap select-all">
              {credsBlock}
            </div>
            <Button
              onClick={() => copyText("creds", credsBlock)}
              className="w-full rounded-full text-white"
              style={{ background: primary }}
            >
              {copied === "creds"
                ? <><Check className="h-4 w-4 mr-1.5" /> Copied!</>
                : <><Copy className="h-4 w-4 mr-1.5" /> Copy email + password + link</>}
            </Button>

            <details className="rounded-xl border bg-white p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-zinc-700">Just the link</summary>
              <div className="mt-2 break-all font-mono text-[11px] text-zinc-700 select-all">{result.url}</div>
              <button
                onClick={() => copyText("url", result.url)}
                className="mt-2 text-xs font-semibold underline"
                style={{ color: primary }}
              >
                {copied === "url" ? "Copied!" : "Copy link only"}
              </button>
            </details>

            <button
              onClick={handleDone}
              className="w-full text-sm font-semibold text-zinc-500 hover:text-zinc-800 py-2"
            >
              Done
            </button>
            <p className="text-[11px] text-zinc-400 text-center">
              If they ever lose the password they can reset it from the login page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <h2 className="font-bold text-lg">Invite a team member</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Full name — optional, populates the profile */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Their name (optional)</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              className="mt-1 h-11"
            />
          </div>

          {/* Email */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="pl-9 h-11"
                autoFocus
              />
            </div>
          </div>

          {/* CP-42: admin sets the password. */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold flex items-center justify-between">
              <span>Set a password</span>
              <button
                type="button"
                onClick={genPassword}
                className="text-[10px] font-bold normal-case tracking-normal underline"
                style={{ color: primary }}
              >
                Generate
              </button>
            </Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              type="text"
              className="mt-1 h-11 font-mono"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              You'll copy this + the sign-in link to send them. They can reset it later from the login page.
            </p>
          </div>

          {/* CP-32: business picker — only shown to agency_admin on the
              agency Team page (businessId prop is null) when they're
              inviting a non-admin role. */}
          {isAgencyFromAgency && role !== "agency_admin" && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Which business?</Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <select
                  value={pickedBusinessId}
                  onChange={(e) => setPickedBusinessId(e.target.value)}
                  className="w-full h-11 pl-9 pr-3 rounded-md border bg-white text-sm"
                >
                  <option value="">{businesses ? "Pick a sub-account…" : "Loading…"}</option>
                  {(businesses ?? []).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Managers see Insights, Billing, Offers, Team. Front-desk only sees scan + redemptions.
              </p>
            </div>
          )}

          {/* Role */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Role</Label>
            <div className="mt-2 space-y-2">
              {allowed.map((r) => {
                const def = ROLE_DEFS[r];
                const Icon = def.icon;
                const selected = role === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={
                      "w-full text-left rounded-2xl border p-3 flex items-start gap-3 transition " +
                      (selected ? "ring-2 ring-offset-1 bg-white" : "hover:bg-zinc-50")
                    }
                    style={{
                      borderColor: selected ? primary : undefined,
                      ['--tw-ring-color' as any]: selected ? primary : undefined,
                    }}
                  >
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: selected ? primary : `${primary}15`,
                        color: selected ? "white" : primary,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold leading-tight">{def.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{def.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button
            onClick={send}
            disabled={busy || !email.trim() || password.length < 8}
            className="rounded-full px-5 bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</>
              : <><LinkIcon className="h-4 w-4 mr-1.5" /> Create account</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
