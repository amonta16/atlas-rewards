"use client";
/**
 * DeskRewardStore — CP-165 · redeem for the member, no phone needed
 *
 * Shows on the desk award panel once a member is up. Pulls desk_member_store:
 * pending free items first (wheel prizes / win-back gifts waiting to be handed
 * over), then the store grouped by category. Claimable rewards are bright
 * with a brand "Redeem" button; locked ones are muted with "N to go". Tapping
 * Redeem asks once, then desk_redeem_reward deducts the points and writes the
 * redemption as fulfilled in one step — the member's app updates by itself.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Lock, Check, Loader2, Sparkles, Clock, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { optimizedUrl } from "@/lib/img";
import { cn } from "@/lib/utils";

type Row = {
  kind: "reward" | "pending"; id: string; name: string; category: string | null; description: string | null;
  image_url: string | null; point_cost: number; affordable: boolean; expires_at: string | null; code: string | null;
};

export function DeskRewardStore({
  membershipId, balance, primary, onRedeemed,
}: {
  membershipId: string;
  balance: number;
  primary: string;
  /** Called with the new balance after a desk redemption / hand-over. */
  onRedeemed: (newBalance: number) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("desk_member_store", { p_membership_id: membershipId });
    setRows(error ? [] : ((data ?? []) as Row[]));
  }, [membershipId]);
  useEffect(() => { load(); }, [load, balance]);

  const pending = useMemo(() => (rows ?? []).filter(r => r.kind === "pending"), [rows]);
  const groups = useMemo(() => {
    const out: { category: string; items: Row[] }[] = [];
    for (const r of (rows ?? []).filter(r => r.kind === "reward")) {
      const c = (r.category ?? "").trim() || "More";
      let g = out.find(x => x.category === c);
      if (!g) { g = { category: c, items: [] }; out.push(g); }
      g.items.push(r);
    }
    // categories with something claimable float up
    return out.sort((a, b) => Number(b.items.some(i => i.affordable)) - Number(a.items.some(i => i.affordable)) || (a.category === "More" ? 1 : 0) - (b.category === "More" ? 1 : 0));
  }, [rows]);
  const claimable = (rows ?? []).filter(r => r.kind === "reward" && r.affordable).length;

  async function redeem(r: Row) {
    if (!confirm(`Redeem ${r.name} for this member? ${r.point_cost.toLocaleString()} pts will be deducted and it's marked as handed over.`)) return;
    setBusy(r.id); setErr(null);
    const { data, error } = await createClient().rpc("desk_redeem_reward", { p_membership_id: membershipId, p_reward_id: r.id });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { new_balance: number } | null;
    setFlash(`${r.name} redeemed — hand it over.`);
    setTimeout(() => setFlash(null), 4000);
    onRedeemed(row?.new_balance ?? balance - r.point_cost);
    load();
  }

  async function handOver(r: Row) {
    setBusy(r.id); setErr(null);
    const { error } = await createClient().rpc("fulfill_redemption", { p_redemption_id: r.id });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setFlash(`${r.name} marked as handed over.`);
    setTimeout(() => setFlash(null), 4000);
    load();
  }

  if (rows === null) {
    return <div className="mt-6 rounded-2xl border bg-white p-4 text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading rewards…</div>;
  }
  if (rows.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-end justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase flex items-center gap-1.5"><Store className="h-3.5 w-3.5" /> Redeem for them</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {claimable > 0 ? <><b className="text-zinc-800">{claimable}</b> reward{claimable === 1 ? "" : "s"} they can claim right now with <b className="text-zinc-800">{balance.toLocaleString()} pts</b>.</> : <>Nothing claimable yet at {balance.toLocaleString()} pts — closest ones are below.</>}
          </p>
        </div>
        <button type="button" onClick={() => setShowLocked(v => !v)} className="text-[11px] font-bold text-zinc-500 hover:text-zinc-800 shrink-0">
          {showLocked ? "Hide locked" : "Show locked"}
        </button>
      </div>

      {flash && <div className="mb-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] font-semibold text-emerald-800 flex items-center gap-2"><Check className="h-4 w-4" /> {flash}</div>}
      {err && <div className="mb-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] font-semibold text-rose-700">{err}</div>}

      {/* Pending free items — hand over, no points */}
      {pending.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Waiting to be handed over</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pending.map(r => (
              <Card key={r.id} r={r} primary={primary} tone="pending" busy={busy === r.id} onAct={() => handOver(r)} />
            ))}
          </div>
        </div>
      )}

      {groups.map(g => {
        const items = showLocked ? g.items : g.items.filter(i => i.affordable);
        const hidden = g.items.length - items.length;
        // With nothing claimable anywhere, show the 2 cheapest locked per category so the desk can say "you're close".
        const shown = items.length ? items : (claimable === 0 ? g.items.slice(0, 2) : []);
        if (!shown.length) return null;
        return (
          <div key={g.category} className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: primary }}>{g.category}</span>
              <span className="text-[10px] font-semibold text-zinc-400">{g.items.filter(i => i.affordable).length}/{g.items.length} claimable</span>
              <span className="flex-1 h-px" style={{ background: `${primary}33` }} />
              {hidden > 0 && !showLocked && items.length > 0 && <span className="text-[10px] text-zinc-400">{hidden} locked</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {shown.map(r => (
                <Card key={r.id} r={r} primary={primary} tone={r.affordable ? "ready" : "locked"} balance={balance} busy={busy === r.id} onAct={() => redeem(r)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ r, primary, tone, balance = 0, busy, onAct }: { r: Row; primary: string; tone: "ready" | "locked" | "pending"; balance?: number; busy: boolean; onAct: () => void }) {
  const locked = tone === "locked";
  const toGo = Math.max(0, r.point_cost - balance);
  const exp = r.expires_at ? new Date(r.expires_at) : null;
  const expSoon = exp ? exp.getTime() - Date.now() < 48 * 3600_000 : false;
  return (
    <div className={cn("rounded-2xl border overflow-hidden flex flex-col", locked ? "bg-zinc-50 border-zinc-200" : "bg-white shadow-sm", tone === "pending" && "border-amber-300 ring-2 ring-amber-200")}>
      <div className={cn("relative aspect-[16/10] bg-zinc-100", locked && "grayscale opacity-60")}>
        {r.image_url
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={optimizedUrl(r.image_url, 320)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0 flex items-center justify-center"><Gift className="h-7 w-7 text-zinc-400" /></div>}
        <span className={cn("absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide inline-flex items-center gap-1",
          tone === "pending" ? "bg-amber-400 text-zinc-900" : locked ? "bg-white/90 text-zinc-600" : "text-white")}
          style={tone === "ready" ? { background: primary } : undefined}>
          {tone === "pending" ? <><Sparkles className="h-2.5 w-2.5" /> Free · won</> : locked ? <><Lock className="h-2.5 w-2.5" /> {toGo.toLocaleString()} to go</> : <><Check className="h-2.5 w-2.5" /> Ready</>}
        </span>
        {exp && (
          <span className={cn("absolute bottom-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold inline-flex items-center gap-1", expSoon ? "bg-red-600 text-white" : "bg-white/90 text-zinc-700")}>
            <Clock className="h-2.5 w-2.5" /> {exp.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
      <div className="p-2.5 flex flex-col flex-1">
        <div className={cn("text-[12px] font-bold leading-tight line-clamp-2 min-h-[2.4em]", locked && "text-zinc-500")}>{r.name}</div>
        <div className="text-[10px] font-semibold text-zinc-500 mt-0.5">{tone === "pending" ? (r.code ? `Code ${r.code}` : "No points needed") : `${r.point_cost.toLocaleString()} pts`}</div>
        <button type="button" onClick={onAct} disabled={locked || busy}
          className={cn("mt-2 h-9 rounded-xl text-[12px] font-extrabold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98]",
            locked ? "bg-zinc-200 text-zinc-500 cursor-not-allowed" : "text-white")}
          style={!locked ? { background: tone === "pending" ? "#d97706" : primary } : undefined}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : locked ? <Lock className="h-3.5 w-3.5" /> : <Gift className="h-3.5 w-3.5" />}
          {tone === "pending" ? "Hand over" : locked ? "Locked" : "Redeem"}
        </button>
      </div>
    </div>
  );
}
