"use client";
/**
 * Atlas Command — Field App (CP-63, Phase 1)
 *
 * A phone-first HUD for the door-sales crew. Iron-Man command-center styling:
 * deep navy, cyan glow, arc-reactor accents. Shows the rep's live commission
 * ("My MRR"), then a pitch-day launcher of every built demo app grouped by
 * location folder — tap to open the customer app on the prospect's phone,
 * self-claim the deal, and set the deal terms right from the field.
 */
import { useMemo, useState } from "react";
import {
  Rocket, ExternalLink, Hand, Check, Loader2, Star, MapPin, CalendarDays,
  TrendingUp, X, DollarSign, RefreshCw, ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { FieldNudgeBell } from "@/components/agency/field-nudge-bell";
import type { FieldApp, RepEarnings } from "@/lib/types/database";

const STAGES: { id: FieldApp["deal_stage"]; label: string; className: string }[] = [
  { id: "demo",    label: "Demo",    className: "bg-sky-400/15 text-sky-200 ring-sky-400/30" },
  { id: "pitched", label: "Pitched", className: "bg-amber-400/15 text-amber-200 ring-amber-400/30" },
  { id: "won",     label: "Won",     className: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30" },
  { id: "lost",    label: "Lost",    className: "bg-rose-400/15 text-rose-200 ring-rose-400/30" },
];

function money(cents: number | null | undefined): string {
  const v = Math.round((cents ?? 0) / 100);
  return "$" + v.toLocaleString();
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

export function FieldClient({
  friendlyName, rootDomain, initialApps, initialEarnings,
}: {
  friendlyName: string;
  rootDomain: string;
  initialApps: FieldApp[];
  initialEarnings: RepEarnings;
}) {
  const { toast } = useToast();
  const [apps, setApps] = useState<FieldApp[]>(initialApps);
  const [earnings, setEarnings] = useState<RepEarnings>(initialEarnings);
  const [filter, setFilter] = useState<"today" | "week" | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FieldApp | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isDev = rootDomain.includes("lvh.me");
  const appUrl = (slug: string) =>
    `${isDev ? "http" : "https"}://${slug}.${rootDomain}${isDev ? ":3000" : ""}`;

  async function refresh() {
    setRefreshing(true);
    const supabase = createClient();
    const [{ data: a }, { data: e }] = await Promise.all([
      supabase.rpc("list_field_apps"),
      supabase.rpc("my_rep_earnings"),
    ]);
    if (a) setApps(a as FieldApp[]);
    if (e) setEarnings((Array.isArray(e) ? e[0] : e) as RepEarnings);
    setRefreshing(false);
  }

  async function claim(app: FieldApp) {
    setBusyId(app.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("claim_business", { p_business_id: app.id });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Claimed ${app.name} 🎯`);
    await refresh();
  }

  async function release(app: FieldApp) {
    setBusyId(app.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("release_business_claim", { p_business_id: app.id });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Released ${app.name}`);
    await refresh();
  }

  // Filter by pitch day.
  const filtered = useMemo(() => {
    if (filter === "all") return apps;
    const today = todayISO();
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndISO = weekEnd.toISOString().slice(0, 10);
    return apps.filter(a => {
      if (!a.pitch_date) return false;
      if (filter === "today") return a.pitch_date === today;
      return a.pitch_date >= today && a.pitch_date <= weekEndISO;
    });
  }, [apps, filter]);

  // Group by location folder.
  const groups = useMemo(() => {
    const m = new Map<string, FieldApp[]>();
    for (const a of filtered) {
      const key = a.folder_name ?? "Unfiled";
      (m.get(key) ?? m.set(key, []).get(key)!).push(a);
    }
    return Array.from(m.entries()).sort((x, y) => x[0].localeCompare(y[0]));
  }, [filtered]);

  return (
    <div className="min-h-screen text-white"
      style={{ background: "radial-gradient(1200px 600px at 50% -10%, #0b3a5e 0%, #061a32 40%, #030d1c 100%)" }}>
      {/* ===== Header ===== */}
      <header className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-cyan-400/15 ring-1 ring-cyan-300/40 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.35)]">
              <Rocket className="h-4 w-4 text-cyan-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] font-extrabold text-cyan-300/70">Atlas Command</div>
              <div className="text-sm font-bold leading-none">Field Ops</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FieldNudgeBell />
            <button onClick={refresh} disabled={refreshing}
              className="h-9 w-9 rounded-xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-cyan-200">
              <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
            </button>
          </div>
        </div>

        {/* ===== My MRR hero (arc reactor) ===== */}
        <div className="relative mt-5 rounded-3xl p-5 overflow-hidden ring-1 ring-cyan-300/20"
          style={{ background: "linear-gradient(160deg, rgba(8,47,73,0.9), rgba(3,13,28,0.9))" }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl opacity-40" style={{ background: "#22d3ee" }} />
          <div className="relative">
            <div className="flex items-center gap-1.5 text-cyan-300/70 text-[11px] font-bold uppercase tracking-widest">
              <TrendingUp className="h-3.5 w-3.5" /> My monthly commission
            </div>
            <div className="mt-1 flex items-end gap-2">
              <div className="text-5xl font-black tracking-tight tabular-nums drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">
                {money(earnings.monthly_commission_cents)}
              </div>
              <div className="text-cyan-200/60 text-sm mb-1.5">/mo</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Won" value={String(earnings.won_count)} />
              <Stat label="Claimed" value={String(earnings.claimed_count)} />
              <Stat label="In pipeline" value={money(earnings.pipeline_commission_cents) + "/mo"} />
            </div>
            <p className="mt-3 text-[11px] text-cyan-100/50 leading-snug">
              Close a claimed deal (mark it <b>Won</b>) and its commission lands here. Lock in. 🔒
            </p>
          </div>
        </div>

        {/* ===== Pitch-day filter ===== */}
        <div className="mt-5 flex items-center gap-2">
          {(["today", "week", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"h-8 px-3 rounded-full text-[12px] font-bold ring-1 transition " +
                (filter === f ? "bg-cyan-400 text-slate-900 ring-cyan-300"
                              : "bg-white/5 text-cyan-100/70 ring-white/10")}>
              {f === "today" ? "Today" : f === "week" ? "This week" : "All apps"}
            </button>
          ))}
        </div>
      </header>

      {/* ===== Launcher ===== */}
      <main className="px-5 pb-16 space-y-6">
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-cyan-100/50 text-sm">
            {filter === "all"
              ? "No apps yet. Build demo apps in the web builder and file them into location folders."
              : "No pitches scheduled for this window. Set a pitch date on an app to see it here."}
          </div>
        )}

        {groups.map(([location, list]) => (
          <section key={location}>
            <div className="flex items-center gap-1.5 mb-2.5 text-cyan-300/70">
              <MapPin className="h-3.5 w-3.5" />
              <h2 className="text-[11px] uppercase tracking-[0.25em] font-extrabold">{location}</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/5 text-cyan-100/50">{list.length}</span>
            </div>
            <div className="space-y-3">
              {list.map(app => (
                <AppCard
                  key={app.id}
                  app={app}
                  busy={busyId === app.id}
                  appUrl={appUrl(app.slug)}
                  onClaim={() => claim(app)}
                  onRelease={() => release(app)}
                  onEdit={() => setEditing(app)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {editing && (
        <DealSheet
          app={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 py-2">
      <div className="text-sm font-extrabold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-cyan-200/50 font-bold">{label}</div>
    </div>
  );
}

function stageMeta(stage: FieldApp["deal_stage"]) {
  return STAGES.find(s => s.id === stage) ?? STAGES[0];
}

function AppCard({
  app, busy, appUrl, onClaim, onRelease, onEdit,
}: {
  app: FieldApp;
  busy: boolean;
  appUrl: string;
  onClaim: () => void;
  onRelease: () => void;
  onEdit: () => void;
}) {
  const primary = app.brand_colors?.primary ?? "#1d6fa5";
  const sm = stageMeta(app.deal_stage);

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-white/10"
      style={{ background: "rgba(255,255,255,0.03)" }}>
      {/* cover */}
      <div className="h-16 bg-cover bg-center relative"
        style={app.hero_image_url ? { backgroundImage: `url("${app.hero_image_url}")` }
                                  : { background: `linear-gradient(135deg, ${primary}, ${app.brand_colors?.secondary ?? primary})` }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(3,13,28,0) 0%, rgba(3,13,28,0.75) 100%)" }} />
        <span className={"absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 " + sm.className}>{sm.label}</span>
        {app.pitch_date && (
          <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-cyan-100 flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {app.pitch_date}
          </span>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-center gap-3 -mt-8 relative">
          {app.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={app.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/15 bg-white shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-black ring-2 ring-white/15 shrink-0" style={{ background: primary }}>
              {app.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0 pt-6">
            <div className="font-bold truncate">{app.name}</div>
            <div className="text-[11px] text-cyan-200/50 truncate">
              {app.deal_mrr_cents ? `${money(app.deal_mrr_cents)}/mo deal · you'd earn ${money(app.monthly_commission_cents)}/mo` : "No deal MRR set yet"}
            </div>
          </div>
        </div>

        {/* claim banner */}
        {app.claimed_by && (
          <div className={"mt-3 text-[11px] rounded-lg px-2.5 py-1.5 ring-1 " +
            (app.is_mine ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/25"
                         : "bg-white/5 text-cyan-100/60 ring-white/10")}>
            {app.is_mine ? <><Star className="h-3 w-3 inline mr-1 -mt-0.5" /> Claimed by you</>
                         : <>Claimed by {app.claimed_by_name || app.claimed_by_email}</>}
          </div>
        )}

        {/* actions */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={appUrl} target="_blank" rel="noopener noreferrer"
            className="h-10 rounded-xl bg-cyan-400 text-slate-900 font-bold text-[13px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
            <ExternalLink className="h-4 w-4" /> Open app
          </a>
          {app.is_mine ? (
            <button onClick={onRelease} disabled={busy}
              className="h-10 rounded-xl bg-white/5 ring-1 ring-white/10 text-cyan-100/80 font-bold text-[13px] flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mine
            </button>
          ) : (
            <button onClick={onClaim} disabled={busy || (!!app.claimed_by)}
              className="h-10 rounded-xl bg-white/10 ring-1 ring-cyan-300/30 text-cyan-100 font-bold text-[13px] flex items-center justify-center gap-1.5 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}
              {app.claimed_by ? "Claimed" : "Claim"}
            </button>
          )}
        </div>

        <button onClick={onEdit}
          className="mt-2 w-full h-9 rounded-xl bg-transparent ring-1 ring-white/10 text-cyan-200/70 text-[12px] font-semibold flex items-center justify-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" /> Deal terms & stage <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ---- Deal terms bottom sheet ---- */
function DealSheet({
  app, onClose, onSaved,
}: {
  app: FieldApp;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [mrr, setMrr] = useState(app.deal_mrr_cents ? String(Math.round(app.deal_mrr_cents / 100)) : "");
  const [pct, setPct] = useState(app.commission_pct != null ? String(app.commission_pct) : "");
  const [pitch, setPitch] = useState(app.pitch_date ?? "");
  const [stage, setStage] = useState<FieldApp["deal_stage"]>(app.deal_stage);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_deal_terms", {
      p_business_id: app.id,
      p_deal_mrr_cents: mrr.trim() ? Math.round(parseFloat(mrr) * 100) : null,
      p_commission_pct: pct.trim() ? parseFloat(pct) : null,
      p_pitch_date: pitch.trim() || null,
      p_deal_stage: stage,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Deal updated");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#08192e] ring-1 ring-cyan-300/20 rounded-t-3xl sm:rounded-3xl p-5 text-white"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2"><DollarSign className="h-4 w-4 text-cyan-300" /> {app.name}</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-white/5 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>

        <label className="text-[11px] uppercase tracking-widest font-bold text-cyan-200/60">Deal MRR ($/mo)</label>
        <input value={mrr} onChange={e => setMrr(e.target.value)} inputMode="decimal" placeholder="e.g. 299"
          className="mt-1 w-full h-11 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 text-white placeholder:text-cyan-100/30" />

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-cyan-200/60">Commission %</label>
            <input value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" placeholder="default"
              className="mt-1 w-full h-11 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 text-white placeholder:text-cyan-100/30" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-cyan-200/60">Pitch date</label>
            <input value={pitch} onChange={e => setPitch(e.target.value)} type="date"
              className="mt-1 w-full h-11 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 text-white" />
          </div>
        </div>

        <label className="block text-[11px] uppercase tracking-widest font-bold text-cyan-200/60 mt-3">Stage</label>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {STAGES.map(s => (
            <button key={s.id} onClick={() => setStage(s.id)}
              className={"h-10 rounded-xl text-[12px] font-bold ring-1 " +
                (stage === s.id ? s.className + " ring-2" : "bg-white/5 text-cyan-100/60 ring-white/10")}>
              {s.label}
            </button>
          ))}
        </div>

        <button onClick={save} disabled={busy}
          className="mt-5 w-full h-12 rounded-2xl bg-cyan-400 text-slate-900 font-black flex items-center justify-center gap-2">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Save deal
        </button>
      </div>
    </div>
  );
}
