"use client";
/**
 * InviteMemberModal — CP-46 (email + password invites)
 *
 * The old "Wrong email or password" failures were caused by the auth
 * row being created via raw SQL (GoTrue couldn't load it). CP-46 fixes
 * that by creating the user through the Admin SDK, so password sign-in
 * works reliably now. The inviter sets a password (or leaves it blank to
 * auto-generate one); we create the account and show email + password
 * once so they can pass the credentials along. The teammate can change
 * the password later from their profile.
 */

import { useEffect, useState } from "react";
import { X, Crown, Shield, User, UserCog, Loader2, Mail, Building2, Copy, Check, KeyRound, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type Role = "agency_admin" | "agency_va" | "business_manager" | "business_staff";
type BizPick = { id: string; name: string };

const ROLE_DEFS: Record<Role, { label: string; description: string; icon: typeof Crown }> = {
  agency_admin: {
    label: "Agency admin",
    description: "Full access to every sub-account, billing, and the agency dashboard.",
    icon: Crown,
  },
  agency_va: {
    label: "VA (assistant)",
    description: "Can create and manage apps, but can't delete businesses or see analytics. Deletions need admin approval.",
    icon: UserCog,
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
  // CP-46: password-based invites. Leave blank to auto-generate one.
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(() => {
    if (callerRole === "business_manager") return "business_staff";
    if (callerRole === "agency_admin" && businessId !== null) return "business_staff";
    return "business_manager";
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { email: string; password: string; loginUrl: string; createdNew: boolean }
    | null
  >(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  // Agency-wide roles aren't scoped to a business.
  const isAgencyRole = (r: Role) => r === "agency_admin" || r === "agency_va";

  // What roles can the caller invite?
  const allowed: Role[] = (() => {
    if (callerRole === "agency_admin") return ["agency_admin", "agency_va", "business_manager", "business_staff"];
    if (callerRole === "business_manager") return ["business_manager", "business_staff"];
    return [];
  })();

  async function send() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email"); return;
    }
    const effectiveBusinessId = isAgencyRole(role)
      ? null
      : (businessId ?? (pickedBusinessId || null));
    if (!isAgencyRole(role) && !effectiveBusinessId) {
      toast.error("Pick which business this person joins"); return;
    }
    if (password && password.trim().length < 8) {
      toast.error("Password must be at least 8 characters"); return;
    }
    setBusy(true);
    try {
      // CP-46: password-based invites. If `password` is blank the server
      // generates a readable one and returns it.
      const res = await fetch("/api/team/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          business_id: effectiveBusinessId,
          full_name: fullName.trim() || undefined,
          password: password.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not create account");

      setResult({
        email: json.email as string,
        password: json.password as string,
        loginUrl: json.login_url as string,
        createdNew: !!json.created_new,
      });
      toast.success(json.created_new ? "Account created" : "Account updated (role attached)");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  }

  function copyCredentials(r: { email: string; password: string; loginUrl: string }) {
    copyText(
      `Sign in: ${r.loginUrl}\nEmail: ${r.email}\nPassword: ${r.password}`,
      "all",
    );
  }

  function handleDone() {
    setResult(null);
    setCopied(null);
    setEmail("");
    setFullName("");
    setPassword("");
    onInvited();
  }

  // ── Credentials success view (email + password) ──────────────────────
  if (result) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <KeyRound className="h-4 w-4" style={{ color: primary }} />
              Account ready
            </h2>
            <button onClick={handleDone} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-zinc-600">
              Share these with <b>{result.email}</b>. They sign in at the login page below — they can change the password later from their profile.
            </p>

            <div className="rounded-xl border divide-y bg-zinc-50">
              <CredRow label="Sign-in page" value={result.loginUrl} mono onCopy={() => copyText(result.loginUrl, "url")} copied={copied === "url"} />
              <CredRow label="Email" value={result.email} onCopy={() => copyText(result.email, "email")} copied={copied === "email"} />
              <CredRow label="Password" value={result.password} mono onCopy={() => copyText(result.password, "pw")} copied={copied === "pw"} />
            </div>

            <Button
              onClick={() => copyCredentials(result)}
              className="w-full rounded-full text-white"
              style={{ background: primary }}
            >
              {copied === "all"
                ? <><Check className="h-4 w-4 mr-1.5" /> Copied all!</>
                : <><Copy className="h-4 w-4 mr-1.5" /> Copy all three</>}
            </Button>

            <button
              onClick={handleDone}
              className="w-full text-sm font-semibold text-zinc-500 hover:text-zinc-800 py-2"
            >
              Done
            </button>
            <p className="text-[11px] text-zinc-400 text-center leading-snug">
              This password is only shown once. If they lose it, just invite them again to reset it.
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
          {/* Full name — optional */}
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
            <p className="text-[11px] text-zinc-500 mt-1">
              They'll sign in with this email and the password below.
            </p>
          </div>

          {/* Password — optional, auto-generated when blank */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Password</Label>
            <div className="relative mt-1">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                className="pl-9 pr-10 h-11"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setPassword(`Atlas-${Math.random().toString(36).slice(2, 4)}${Math.floor(100 + Math.random() * 900)}${Math.random().toString(36).slice(2, 4)}`)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-500"
                aria-label="Generate a password"
                title="Generate a password"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              We'll show it once after you create the account so you can pass it along. They can change it later.
            </p>
          </div>

          {/* Business picker */}
          {isAgencyFromAgency && !isAgencyRole(role) && (
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
            disabled={busy || !email.trim()}
            className="rounded-full px-5 bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating account…</>
              : <><KeyRound className="h-4 w-4 mr-1.5" /> Create account</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CredRow({
  label, value, mono, onCopy, copied,
}: {
  label: string; value: string; mono?: boolean; onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{label}</div>
        <div className={"text-zinc-800 truncate select-all " + (mono ? "font-mono text-[12px]" : "text-sm font-semibold")}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 h-8 w-8 rounded-md hover:bg-zinc-200 flex items-center justify-center text-zinc-500"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
