"use client";
/**
 * DeskRewardStore — CP-165 · redeem for the member, no phone needed
 *
 * Shows on the desk award panel once a member is up. Pulls desk_member_store:
 * pending free items first (wheel prizes / win-back gifts waiting to be handed
 * over), then the store grouped by category. Claimable rewards are bright
 * with a brand "Redeem" button; locked ones are muted with "N to go".
 *
 * CP-167 · no more browser confirm(). Tapping Redeem opens an inline
 * confirmation card right above the grid (what, how many points, balance
 * after) with a big brand "Yes, redeem" button. After the RPC the same slot
 * turns into a persistent green "HAND OVER" receipt — item name, points
 * taken, new balance, who did it and when — that stays until staff tap
 * "Done" or pick the next item, so there's never a question of whether it
 * went through. A "Redeemed today" strip under the header lists everything
 * this member has picked up today (desk or app), so a second station can
 * see it too. The list also reloads on the desk's realtime feed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Lock, Check, Loader2, Sparkles, Clock, Store, X, ArrowRight, HandCoins, PackageCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { optimizedUrl } from "@/lib/img";
import { useDeskLive } from "@/lib/desk-live";
import { cn } from "@/lib/utils";

type Row = {
  kind: "reward" | "pending"; id: string; name: string; category: string | null; description: string | null;
  image_url: string | null; point_cost: number; affordable: boolean; expires_at: string | null; code: string | null;
};
type TodayRow = { id: string; point_cost: number; fulfilled_at: string | null; status: string; rewards: { name: string; image_url: string | null } | null };

type Stage =
  | { step: "confirm"; row: Row }
  | { step: "done"; row: Row; pointsTaken: number; newBalance: number; at: Date };

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
  const [today, setToday] = useState<TodayRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);
  const { tick } = useDeskLive();

  const load = useCallback(async () => {
    const supabase = createClient();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [store, done] = await Promise.all([
      supabase.rpc("desk_member_store", { p_membership_id: membershipId }),
      supabase.from("redemptions")
        .select("id,point_cost,fulfilled_at,status,rewards(name,image_url)")
        .eq("membership_id", membershipId)
        .eq("status", "fulfilled")
        .gte("fulfilled_at", start.toISOString())
        .order("fulfilled_at", { ascending: false })
        .limit(12),
    ]);
    setRows(store.error ? [] : ((store.data ?? []) as Row[]));
    setToday(done.error ? [] : ((done.data ?? []) as unknown as TodayRow[]));
  }, [membershipId]);
  useEffect(() => { load(); }, [load, balance, tick]);

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

  function ask(r: Row) {
    setErr(null);
    setStage({ step: "confirm", row: r });
    // bring the card into view on a long panel
    setTimeout(() => document.getElementById("desk-redeem-stage")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  }

  async function confirmRedeem(r: Row) {
    setBusy(r.id); setErr(null);
    const { data, error } = await createClient().rpc("desk_redeem_reward", { p_membership_id: membershipId, p_reward_id: r.id });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { new_balance: number } | null;
    const nb = row?.new_balance ?? balance - r.point_cost;
    setStage({ step: "done", row: r, pointsTaken: r.point_cost, newBalance: nb, at: new Date() });
    onRedeemed(nb);
    load();
  }

  async function handOver(r: Row) {
    setBusy(r.id); setErr(null);
    const { error } = await createClient().rpc("fulfill_redemption", { p_redemption_id: r.id });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setStage({ step: "done", row: r, pointsTaken: 0, newBalance: balance, at: new Date() });
    load();
  }

  if (rows === null) {
    return <div className="mt-6 rounded-2xl border bg-white p-4 text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading rewards…</div>;
  }
  if (rows.length === 0 && today.length === 0 && !stage) return null;

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

      {/* CP-167: the confirm / receipt slot */}
      <div id="desk-redeem-stage" className="scroll-mt-24">
        {stage?.step === "confirm" && (
          <ConfirmCard row={stage.row} balance={balance} primary={primary} busy={busy === stage.row.id}
            onYes={() => confirmRedeem(stage.row)} onNo={() => setStage(null)} />
        )}
        {stage?.step === "done" && (
          <ReceiptCard stage={stage} onDone={() => setStage(null)} />
        )}
      </div>
      {err && <div className="mb-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] font-semibold text-rose-700">{err}</div>}

      {/* CP-167: what they've already picked up today */}
      {today.length > 0 && (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 flex items-center gap-1.5 mb-1"><PackageCheck className="h-3 w-3" /> Redeemed today · {today.length}</div>
          <ul className="flex flex-wrap gap-1.5">
            {today.map(t => (
              <li key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-emerald-200 pl-1 pr-2.5 py-0.5 text-[11px] font-semibold text-zinc-700">
                <span className="h-5 w-5 rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center shrink-0">
                  {t.rewards?.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={optimizedUrl(t.rewards.image_url, 40)} alt="" className="h-full w-full object-cover" />
                    : <Check className="h-3 w-3 text-emerald-700" />}
                </span>
                <span className="truncate max-w-[10rem]">{t.rewards?.name ?? "Reward"}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500 tabular-nums">{t.fulfilled_at ? new Date(t.fulfilled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending free items — hand over, no points */}
      {pending.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Waiting to be handed over</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pending.map(r => (
              <Card key={r.id} r={r} primary={primary} tone="pending" busy={busy === r.id} selected={stage?.step === "confirm" && stage.row.id === r.id} onAct={() => handOver(r)} />
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
                <Card key={r.id} r={r} primary={primary} tone={r.affordable ? "ready" : "locked"} balance={balance} busy={busy === r.id}
                  selected={stage?.step === "confirm" && stage.row.id === r.id} onAct={() => ask(r)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** CP-167: inline "are you sure" — replaces window.confirm. */
function ConfirmCard({ row, balance, primary, busy, onYes, onNo }: { row: Row; balance: number; primary: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  const after = Math.max(0, balance - row.point_cost);
  return (
    <div className="mb-3 rounded-2xl border-2 bg-white p-3 shadow-lg" style={{ borderColor: primary }}>
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
          {row.image_url
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={optimizedUrl(row.image_url, 128)} alt="" className="h-full w-full object-cover" />
            : <Gift className="h-6 w-6 text-zinc-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: primary }}>Redeem this for them?</div>
          <div className="text-[15px] font-extrabold leading-tight mt-0.5">{row.name}</div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] font-semibold text-zinc-600 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 tabular-nums"><HandCoins className="h-3 w-3" /> −{row.point_cost.toLocaleString()} pts</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-zinc-500">{balance.toLocaleString()} <ArrowRight className="h-3 w-3" /> <b className="text-zinc-800">{after.toLocaleString()} pts</b> left</span>
          </div>
        </div>
        <button type="button" onClick={onNo} className="h-8 w-8 rounded-full hover:bg-zinc-100 flex items-center justify-center shrink-0" aria-label="Cancel"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" onClick={onNo} disabled={busy} className="h-12 rounded-xl border bg-white text-[13px] font-bold text-zinc-700 hover:bg-zinc-50">Not now</button>
        <button type="button" onClick={onYes} disabled={busy}
          className="h-12 rounded-xl text-white text-[14px] font-extrabold inline-flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition disabled:opacity-70"
          style={{ background: primary }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {busy ? "Redeeming…" : "Yes, redeem & hand over"}
        </button>
      </div>
    </div>
  );
}

/** CP-167: the receipt that stays on screen until staff dismiss it. */
function ReceiptCard({ stage, onDone }: { stage: Extract<Stage, { step: "done" }>; onDone: () => void }) {
  const { row, pointsTaken, newBalance, at } = stage;
  return (
    <div className="mb-3 rounded-2xl border-2 border-emerald-500 bg-emerald-600 text-white p-3 shadow-lg relative overflow-hidden">
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/15 blur-2xl pointer-events-none" />
      <div className="relative flex items-start gap-3">
        <div className="h-16 w-16 rounded-xl overflow-hidden bg-white/20 shrink-0 flex items-center justify-center ring-2 ring-white/60">
          {row.image_url
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={optimizedUrl(row.image_url, 128)} alt="" className="h-full w-full object-cover" />
            : <Gift className="h-6 w-6 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100 flex items-center gap-1.5"><PackageCheck className="h-3.5 w-3.5" /> Redeemed · hand it over now</div>
          <div className="text-[18px] font-black leading-tight mt-0.5">{row.name}</div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] font-semibold flex-wrap">
            {pointsTaken > 0
              ? <span className="rounded-full bg-white/20 px-2 py-0.5 tabular-nums">−{pointsTaken.toLocaleString()} pts · {newBalance.toLocaleString()} left</span>
              : <span className="rounded-full bg-white/20 px-2 py-0.5">Free · no points taken</span>}
            <span className="text-emerald-100 tabular-nums">{at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
            {row.code && <span className="text-emerald-100 font-mono">#{row.code}</span>}
          </div>
        </div>
      </div>
      <button type="button" onClick={onDone} className="relative mt-3 w-full h-11 rounded-xl bg-white text-emerald-700 text-[13px] font-extrabold inline-flex items-center justify-center gap-2 active:scale-[0.99] transition">
        <Check className="h-4 w-4" /> Done — handed over
      </button>
    </div>
  );
}

function Card({ r, primary, tone, balance = 0, busy, selected, onAct }: { r: Row; primary: string; tone: "ready" | "locked" | "pending"; balance?: number; busy: boolean; selected?: boolean; onAct: () => void }) {
  const locked = tone === "locked";
  const toGo = Math.max(0, r.point_cost - balance);
  const exp = r.expires_at ? new Date(r.expires_at) : null;
  const expSoon = exp ? exp.getTime() - Date.now() < 48 * 3600_000 : false;
  return (
    <div className={cn("rounded-2xl border overflow-hidden flex flex-col transition", locked ? "bg-zinc-50 border-zinc-200" : "bg-white shadow-sm", tone === "pending" && "border-amber-300 ring-2 ring-amber-200", selected && "ring-2 ring-offset-1")}
      style={selected ? { boxShadow: `0 0 0 3px ${primary}` } : undefined}>
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
          {tone === "pending" ? "Hand over" : locked ? "Locked" : selected ? "Confirm above" : "Redeem"}
        </button>
      </div>
    </div>
  );
}
