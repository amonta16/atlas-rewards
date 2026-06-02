"use client";
/**
 * InviteMemberModal — rewritten CP-37.16 (magic-link invites)
 *
 * Andrew kept hitting "Wrong email or password" for invited team
 * members regardless of how we wrote the password underneath. We
 * scrapped the password flow entirely. Now the invite mints a
 * one-time magic-link URL via Supabase's native generateLink, the
 * admin copies/sends it, and the recipient is signed in instantly
 * when they click.
 *
 * No password to type, type wrong, forget, or have silently dropped
 * by SDK quirks. The recipient can set a password later from their
 * own profile if they want — for the invite flow it's not needed.
 */

import { useEffect, useState } from "react";
import { X, Crown, Shield, User, Loader2, Mail, Building2, Copy, Check, Link as LinkIcon } from "lucide-react";
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
  const [role, setRole] = useState<Role>(() => {
    if (callerRole === "business_manager") return "business_staff";
    if (callerRole === "agency_admin" && businessId !== null) return "business_staff";
    return "business_manager";
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { url: string; email: string; createdNew: boolean }
    | null
  >(null);
  const [copied, setCopied] = useState(false);

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

  // What roles can the caller invite?
  const allowed: Role[] = (() => {
    if (callerRole === "agency_admin") return ["agency_admin", "business_manager", "business_staff"];
    if (callerRole === "business_manager") return ["business_manager", "business_staff"];
    return [];
  })();

  async function send() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email"); return;
    }
    const effectiveBusinessId = role === "agency_admin"
      ? null
      : (businessId ?? (pickedBusinessId || null));
    if (role !== "agency_admin" && !effectiveBusinessId) {
      toast.error("Pick which business this person joins"); return;
    }
    setBusy(true);
    try {
      // CP-37.16: no password field — backend uses Supabase's
      // generateLink to mint a one-time sign-in URL.
      const res = await fetch("/api/team/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          business_id: effectiveBusinessId,
          full_name: fullName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not create invite link");

      setResult({
        url: json.sign_in_url as string,
        email: json.email as string,
        createdNew: !!json.created_new,
      });
      toast.success(json.created_new ? "Sign-in link created" : "Sign-in link sent (role attached)");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create invite link");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — long-press the link to copy manually");
    }
  }

  function handleDone() {
    setResult(null);
    setCopied(false);
    setEmail("");
    setFullName("");
    onInvited();
  }

  // ── Magic-link success view ──────────────────────────────────────────
  if (result) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <LinkIcon className="h-4 w-4" style={{ color: primary }} />
              Sign-in link ready
            </h2>
            <button onClick={handleDone} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-zinc-600">
              Send this link to <b>{result.email}</b>. They click it once and they're signed in — no password to remember.
            </p>

            <div className="rounded-xl border bg-zinc-50 p-3 break-all font-mono text-[11px] text-zinc-700 select-all">
              {result.url}
            </div>

            <Button
              onClick={() => copyLink(result.url)}
              className="w-full rounded-full text-white"
              style={{ background: primary }}
            >
              {copied
                ? <><Check className="h-4 w-4 mr-1.5" /> Copied!</>
                : <><Copy className="h-4 w-4 mr-1.5" /> Copy sign-in link</>}
            </Button>

            <button
              onClick={handleDone}
              className="w-full text-sm font-semibold text-zinc-500 hover:text-zinc-800 py-2"
            >
              Done
            </button>
            <p className="text-[11px] text-zinc-400 text-center leading-snug">
              Link expires after one use. If they need a new one, just invite them again.
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
              We'll generate a one-tap sign-in link for this address. No password to set.
            </p>
          </div>

          {/* Business picker */}
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
            disabled={busy || !email.trim()}
            className="rounded-full px-5 bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating link…</>
              : <><LinkIcon className="h-4 w-4 mr-1.5" /> Generate sign-in link</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
