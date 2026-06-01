"use client";
/**
 * /agency/bootstrap-admin — CP-37.8
 *
 * Self-bootstrap page. Whoever is signed in when they visit this URL
 * gets promoted to agency_admin (via the bootstrap_self_agency_admin
 * RPC). Solves the chicken-and-egg problem where the by-email SQL
 * keeps missing the actual session's user_id.
 *
 * Also runs `whoami` first and surfaces the result so Andrew can see
 * exactly which account he's authed as — useful when "the promote
 * SQL ran but the page still rejects me" turns out to mean "I'm
 * signed in as a different user than I thought."
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Check, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Status = "loading" | "ready" | "promoting" | "done" | "error";

type Who = {
  user_id: string | null;
  email: string | null;
  role_rows: Array<{ role: string; business_id: string | null; business_slug: string | null }>;
  membership_count: number;
};

export default function BootstrapAdminPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [who, setWho] = useState<Who | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("whoami");
      if (error) { setErr(error.message); setStatus("error"); return; }
      const row = Array.isArray(data) ? data[0] : data;
      setWho(row ?? null);
      setStatus("ready");
    })();
  }, []);

  async function promote(force: boolean) {
    setStatus("promoting");
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("bootstrap_self_agency_admin", {
      p_force: force,
    });
    if (error) { setErr(error.message); setStatus("error"); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setResult(row?.status ?? "unknown");
    setStatus("done");
  }

  const alreadyAdmin = who?.role_rows.some(
    r => r.role === "agency_admin" && r.business_id == null,
  );

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-lg mx-auto">
        <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-zinc-50 to-white">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 text-zinc-700" />
              <h1 className="text-lg font-extrabold">Bootstrap agency admin</h1>
            </div>
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
              Promotes whichever account you're currently signed in as to <code>agency_admin</code>.
              Use this if the by-email promote SQL keeps missing your session.
            </p>
          </div>

          {/* who-am-I panel */}
          <div className="px-6 py-5 border-b">
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-2">
              Currently signed in as
            </div>
            {status === "loading" && (
              <div className="text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> checking…
              </div>
            )}
            {who && (
              <>
                <div className="text-sm">
                  <strong>{who.email ?? "(no email on session)"}</strong>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono break-all mt-0.5">
                  user_id: {who.user_id ?? "(null)"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1.5">
                  business_users rows: {who.role_rows.length === 0 ? "(none)" : ""}
                </div>
                {who.role_rows.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {who.role_rows.map((r, i) => (
                      <li key={i} className="text-[11px] flex items-center gap-2">
                        <span className="inline-block px-1.5 py-0.5 rounded-full bg-zinc-100 font-bold text-zinc-700">
                          {r.role}
                        </span>
                        <span className="text-zinc-500">
                          {r.business_slug ?? (r.business_id ? r.business_id.slice(0, 8) : "(agency-wide)")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* action panel */}
          <div className="px-6 py-5">
            {alreadyAdmin ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-emerald-900">You're already an agency admin.</div>
                  <p className="text-emerald-700 mt-0.5">
                    If <code>/agency</code> still shows "Not an agency admin," hard-refresh that tab
                    (Cmd/Ctrl + Shift + R) — Next.js caches the server response until the auth cookie cycles.
                  </p>
                </div>
              </div>
            ) : status === "done" && result ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-emerald-900">
                    {result === "promoted" && "Promoted ✨ — you're the first agency admin."}
                    {result === "forced" && "Promoted (forced) — you're now an agency admin."}
                    {result === "already_admin" && "Already an admin — no change."}
                    {result === "refused" && "Refused: an agency admin already exists. Use \"Force\" if this is your dev env."}
                  </div>
                  <p className="text-emerald-700 mt-1">
                    Head to <Link href="/agency" className="underline font-semibold">/agency</Link> — hard-refresh it once.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={status === "promoting"}
                  onClick={() => promote(false)}
                >
                  {status === "promoting"
                    ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Promoting…</>
                    : <><Shield className="h-4 w-4 mr-1.5" /> Make me agency admin</>}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={status === "promoting"}
                  onClick={() => promote(true)}
                >
                  Force-promote (overrides "admin already exists")
                </Button>
                <p className="text-[10px] text-zinc-500 text-center">
                  Without the force flag, this is a no-op once any admin exists.
                </p>
              </div>
            )}

            {err && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-800">
                  <div className="font-bold">Couldn't run RPC</div>
                  <p className="mt-0.5 font-mono">{err}</p>
                  <p className="mt-1.5 text-rose-700">
                    Did you run <code>cp37_8_bootstrap_admin.sql</code> in Supabase?
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <Link
                href="/agency"
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
              >
                Go to /agency <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
