"use client";
/**
 * Admin App configure hub — CP-63 (Phase 1)
 *
 * Desktop tab where the owner sets up the mobile Field App: the field link to
 * open on a phone, the default commission %, who the agency owner is, and a
 * live rep leaderboard. Iron-Man command styling to match the field HUD.
 */
import { useEffect, useState } from "react";
import {
  Rocket, Smartphone, Copy, Check, Crown, Trophy, DollarSign, Loader2, ExternalLink,
  Bell, Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { RepLeaderRow } from "@/lib/types/database";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" }, { key: "tue", label: "Tuesday" }, { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" }, { key: "fri", label: "Friday" }, { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
type NudgeConfig = { enabled: boolean; hour: number; messages: Record<DayKey, string> };

function money(cents: number | null | undefined): string {
  return "$" + Math.round((cents ?? 0) / 100).toLocaleString();
}

export function AdminAppClient({
  myUserId, myEmail, initialOwnerId, ownerEmail, initialDefaultPct, initialNudges, leaderboard,
}: {
  myUserId: string;
  myEmail: string;
  initialOwnerId: string | null;
  ownerEmail: string | null;
  initialDefaultPct: number;
  initialNudges: NudgeConfig;
  leaderboard: RepLeaderRow[];
}) {
  const { toast } = useToast();
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [ownerLabel, setOwnerLabel] = useState(ownerEmail);
  const [pct, setPct] = useState(String(initialDefaultPct));
  const [savingPct, setSavingPct] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [fieldUrl, setFieldUrl] = useState("/field");
  const [copied, setCopied] = useState(false);

  // Nudges
  const [nudges, setNudges] = useState<NudgeConfig>(initialNudges);
  const [savingNudges, setSavingNudges] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { setFieldUrl(`${window.location.origin}/field`); }, []);

  const iAmOwner = ownerId === myUserId || ownerId === null;

  async function saveNudges() {
    setSavingNudges(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_admin_nudges", {
      p_enabled: nudges.enabled,
      p_hour: nudges.hour,
      p_mon: nudges.messages.mon, p_tue: nudges.messages.tue, p_wed: nudges.messages.wed,
      p_thu: nudges.messages.thu, p_fri: nudges.messages.fri, p_sat: nudges.messages.sat,
      p_sun: nudges.messages.sun,
    });
    setSavingNudges(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Nudges saved");
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin-app/daily-nudge?test=1", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success(json.skipped ? `Skipped: ${json.skipped}` : "Test nudge sent to you 🔔");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't send test");
    } finally {
      setTesting(false);
    }
  }

  async function savePct() {
    setSavingPct(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_admin_app_config", {
      p_default_commission_pct: pct.trim() ? parseFloat(pct) : null,
    });
    setSavingPct(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Default commission saved");
  }

  async function makeMeOwner() {
    setSavingOwner(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_admin_app_config", { p_owner_user_id: myUserId });
    setSavingOwner(false);
    if (error) { toast.error(error.message); return; }
    setOwnerId(myUserId); setOwnerLabel(myEmail);
    toast.success("You're now the agency owner");
  }

  async function copyUrl() {
    try { await navigator.clipboard.writeText(fieldUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { toast.error("Couldn't copy"); }
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #061a32 0%, #04132a 55%, #020c1c 100%)" }}>
      <header className="px-8 pt-10 pb-6">
        <div className="flex items-center gap-2 text-cyan-300/70">
          <Rocket className="h-4 w-4" />
          <span className="text-[11px] uppercase tracking-[0.3em] font-extrabold">Atlas Command</span>
        </div>
        <h1 className="text-3xl font-black text-white mt-1">Admin App</h1>
        <p className="text-sm text-sky-200/60 mt-1">
          Your team's phone-first field companion — pitch launcher, deal claims, and commissions.
        </p>
      </header>

      <div className="px-8 pb-16 grid gap-5 lg:grid-cols-2 max-w-5xl">
        {/* Open on phone */}
        <Card>
          <CardTitle icon={<Smartphone className="h-4 w-4" />}>Open on your phone</CardTitle>
          <p className="text-sm text-sky-200/60 mt-1">
            Sign in on your phone's browser and go to this link, then "Add to Home Screen" for one-tap field access.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-black/30 ring-1 ring-white/10 px-3 py-2 text-cyan-200 text-sm">{fieldUrl}</code>
            <button onClick={copyUrl} className="h-9 w-9 rounded-lg bg-white/5 ring-1 ring-white/10 text-cyan-200 flex items-center justify-center">
              {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            </button>
            <a href="/field" target="_blank" rel="noreferrer" className="h-9 px-3 rounded-lg bg-cyan-400 text-slate-900 font-bold text-sm flex items-center gap-1.5">
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </div>
        </Card>

        {/* Commission default */}
        <Card>
          <CardTitle icon={<DollarSign className="h-4 w-4" />}>Default commission</CardTitle>
          <p className="text-sm text-sky-200/60 mt-1">
            The % a rep earns of a deal's monthly MRR when they close it. Override per deal in the field app.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative">
              <input value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal"
                disabled={!iAmOwner}
                className="w-28 h-10 rounded-lg bg-black/30 ring-1 ring-white/10 px-3 pr-7 text-white text-lg font-bold disabled:opacity-50" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-200/50">%</span>
            </div>
            <button onClick={savePct} disabled={savingPct || !iAmOwner}
              className="h-10 px-4 rounded-lg bg-cyan-400 text-slate-900 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
              {savingPct ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </button>
          </div>
          {!iAmOwner && <p className="text-[11px] text-amber-300/70 mt-2">Only the agency owner can change this.</p>}
        </Card>

        {/* Owner */}
        <Card>
          <CardTitle icon={<Crown className="h-4 w-4" />}>Agency owner</CardTitle>
          <p className="text-sm text-sky-200/60 mt-1">
            The owner can reassign claims off other reps and edit these settings.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-sm text-white">
              {ownerLabel ? <>Current: <b>{ownerLabel}</b></> : <span className="text-sky-200/50">No owner set (any admin can manage)</span>}
            </div>
            {ownerId !== myUserId && (
              <button onClick={makeMeOwner} disabled={savingOwner}
                className="h-9 px-3 rounded-lg bg-white/5 ring-1 ring-cyan-300/30 text-cyan-100 font-semibold text-sm flex items-center gap-1.5">
                {savingOwner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />} Make me owner
              </button>
            )}
          </div>
        </Card>

        {/* Daily nudges */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle icon={<Bell className="h-4 w-4" />}>Daily motivation</CardTitle>
            <div className="flex items-center gap-2">
              <button onClick={sendTest} disabled={testing}
                className="h-9 px-3 rounded-lg bg-white/5 ring-1 ring-white/10 text-cyan-100 font-semibold text-sm flex items-center gap-1.5">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test to me
              </button>
              <label className="flex items-center gap-2 text-sm text-sky-200/70 cursor-pointer">
                <input type="checkbox" checked={nudges.enabled} disabled={!iAmOwner}
                  onChange={e => setNudges(n => ({ ...n, enabled: e.target.checked }))}
                  className="h-4 w-4 accent-cyan-400" />
                Enabled
              </label>
            </div>
          </div>
          <p className="text-sm text-sky-200/60 mt-1">
            One message per weekday, sent every morning to the crew's bell + phone push. Keep 'em short and hype. 🔥
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {DAYS.map(d => (
              <div key={d.key}>
                <label className="text-[10px] uppercase tracking-widest font-bold text-cyan-200/50">{d.label}</label>
                <input
                  value={nudges.messages[d.key]}
                  disabled={!iAmOwner}
                  onChange={e => setNudges(n => ({ ...n, messages: { ...n.messages, [d.key]: e.target.value } }))}
                  className="mt-1 w-full h-10 rounded-lg bg-black/30 ring-1 ring-white/10 px-3 text-white text-sm placeholder:text-cyan-100/30 disabled:opacity-50"
                  placeholder={`${d.label} message…`}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={saveNudges} disabled={savingNudges || !iAmOwner}
              className="h-10 px-4 rounded-lg bg-cyan-400 text-slate-900 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
              {savingNudges ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save messages
            </button>
            {!iAmOwner && <span className="text-[11px] text-amber-300/70">Only the agency owner can edit nudges.</span>}
          </div>
        </Card>

        {/* Leaderboard */}
        <Card className="lg:col-span-2">
          <CardTitle icon={<Trophy className="h-4 w-4" />}>Rep leaderboard</CardTitle>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-sky-200/50 mt-3">No claims yet. Reps claim deals from the field app.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {leaderboard.map((r, i) => (
                <div key={r.user_id} className="flex items-center gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2.5">
                  <div className={"h-7 w-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 " +
                    (i === 0 ? "bg-amber-400 text-slate-900" : i === 1 ? "bg-slate-300 text-slate-900" : i === 2 ? "bg-orange-400 text-slate-900" : "bg-white/10 text-cyan-100")}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{r.full_name || r.email}</div>
                    <div className="text-[11px] text-sky-200/50">{r.won_count} won · {r.claimed_count} claimed</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-cyan-200 tabular-nums">{money(r.monthly_commission_cents)}<span className="text-cyan-200/50 text-xs">/mo</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"rounded-2xl p-5 ring-1 ring-white/10 " + className}
      style={{ background: "rgba(255,255,255,0.03)" }}>
      {children}
    </div>
  );
}
function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-white font-bold">
      <span className="h-8 w-8 rounded-lg bg-cyan-400/15 ring-1 ring-cyan-300/30 text-cyan-300 flex items-center justify-center">{icon}</span>
      {children}
    </div>
  );
}
