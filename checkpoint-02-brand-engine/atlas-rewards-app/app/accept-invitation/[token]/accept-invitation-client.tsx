"use client";
/**
 * AcceptInvitationClient — CP-31
 *
 * Mini "claim your spot" page. Shows the signed-in email and lets the
 * user accept (creates the business_users row) or bail out.
 *
 * On success we route to the role-appropriate dashboard:
 *   agency_admin    → /agency
 *   business_*      → /<business-slug>/manage
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Shield, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function AcceptInvitationClient({
  token, userEmail,
}: {
  token: string;
  userEmail: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ role: string; business_id: string | null } | null>(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not accept");

      toast.success("You're in!");
      setDone({ role: json.role, business_id: json.business_id });

      // Route to the right place. For business_* we need the slug; fetch it.
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
      // Small delay so the toast registers.
      setTimeout(() => router.push(to), 400);
    } catch (e: any) {
      setErr(e?.message ?? "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg overflow-hidden">
        <div className="p-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mb-4">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold">You've been invited to Atlas</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-snug">
            Accept below to join your team. You'll be signed in as
            <br />
            <span className="font-semibold text-zinc-800">{userEmail}</span>.
          </p>
        </div>

        {err && (
          <div className="mx-6 mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
            <X className="h-4 w-4 mt-0.5 shrink-0" /> {err}
          </div>
        )}

        {done ? (
          <div className="mx-6 mb-6 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700 flex items-center gap-2">
            <Check className="h-4 w-4" /> Joined as <strong className="ml-0.5">{labelForRole(done.role)}</strong>. Routing you in…
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-2">
            <Button onClick={accept} disabled={busy} className="w-full h-12 text-base font-bold bg-zinc-900 hover:bg-zinc-800 text-white">
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</> : "Accept invitation"}
            </Button>
            <button onClick={signOut} className="w-full text-xs text-zinc-500 hover:text-zinc-700 mt-1">
              Wrong account? Sign out
            </button>
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
