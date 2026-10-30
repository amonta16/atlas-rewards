"use client";
/**
 * InsightsDashboard — CP-32 → CP-36 cleanup
 *
 * CP-36 removed two surfaces Andrew said weren't pulling weight:
 *   • Busiest hours (no operator was actually staffing off it)
 *   • Come-Back AI predictions (overlap with the simpler Inactive list)
 *
 * The Inactive list is now the single win-back surface and was upgraded:
 *   • Cutoff bumped to 60 days (was 30) — matches Andrew's "if I haven't
 *     seen them in two months, that's when I want a nudge".
 *   • "We miss you" composer: choose how many bonus credits to drop +
 *     send to one row, or fire-and-forget to the whole list with one tap.
 *
 * Top loyal members is unchanged structurally but now sits with a clearer
 * "real tracking" caption (the existing top_loyal_members RPC already
 * sums lifetime_points_earned + visit_count, so the data was always real
 * — Andrew just wanted the framing to read like the system is actively
 * watching, not a one-off snapshot).
 */
import { useEffect, useState } from "react";
import { Mail, Send, Trophy, X, MessageSquareHeart, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { Business } from "@/lib/types/database";
import { InsightsV3 } from "@/components/manager/insights-v3";

type TopMember = {
  membership_id: string; full_name: string | null; email: string | null;
  lifetime_points: number; points_balance: number; visit_count: number;
  last_visit_at: string | null; total_spent_cents?: number;
};
type Inactive = {
  membership_id: string; full_name: string | null; email: string | null; phone: string | null;
  last_visit_at: string | null; days_since_last: number | null; visit_count: number;
  // CP-86: returned by inactive_members v2 so never-checked-in members can
  // show "joined <date>" instead of a blank.
  joined_at?: string | null;
};

// CP-86: selectable win-back window. 60d stays the default (Andrew's "two
// months"), but shorter windows make the list actually usable for newer
// businesses whose whole member base is younger than 60 days.
const INACTIVE_WINDOWS = [7, 14, 30, 60, 90] as const;

// CP-36: minimum days since last visit before we consider a member inactive.
// Andrew explicitly asked for two months.
const INACTIVE_DAYS = 60;

// CP-171: `trends` (embedded BusinessInsights) is no longer rendered — the
// 12-week momentum chart in InsightsV3 covers it. Prop kept so the call site
// in manager-dashboard.tsx doesn't need to change.
export function InsightsDashboard({ business }: { business: Business; trends?: React.ReactNode }) {
  const { toast } = useToast();
  const [top, setTop]             = useState<TopMember[]>([]);
  const [inactive, setInactive]   = useState<Inactive[]>([]);
  // CP-86: adjustable window (days without a check-in). Default 60.
  const [inactiveDays, setInactiveDays] = useState<number>(INACTIVE_DAYS);
  // CP-86: surface the RPC error instead of silently rendering an empty
  // list — a missing migration used to read as "nice retention 👏".
  const [inactiveErr, setInactiveErr] = useState<string | null>(null);
  const [sending, setSending]     = useState<string | "all" | null>(null);
  // CP-36: we-miss-you composer — opens with either a single membership
  // selected, or null (= send-to-all-inactive).
  const [composer, setComposer] = useState<{ target: Inactive | "all" } | null>(null);
  // CP-162: store-visible rewards for the win-back gift picker.
  const [winbackRewards, setWinbackRewards] = useState<{ id: string; name: string; point_cost: number; image_url: string | null }[]>([]);
  useEffect(() => {
    createClient().from("rewards").select("id,name,point_cost,image_url")
      .eq("business_id", business.id).eq("is_active", true).is("archived_at", null)
      .order("point_cost").limit(30)
      .then(({ data }) => setWinbackRewards((data ?? []) as any));
  }, [business.id]);

  async function loadAll() {
    const supabase = createClient();
    const [{ data: t }, inactiveRes] = await Promise.all([
      supabase.rpc("top_loyal_members", { p_business_id: business.id, p_limit: 5 }),
      supabase.rpc("inactive_members",  { p_business_id: business.id, p_min_days: inactiveDays, p_limit: 50 }),
    ]);
    setTop((t ?? []) as TopMember[]);
    setInactive((inactiveRes.data ?? []) as Inactive[]);
    setInactiveErr(inactiveRes.error ? inactiveRes.error.message : null);
  }

  // CP-86: re-query when the win-back window changes too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, [business.id, inactiveDays]);

  // CP-36: send a we-miss-you notification (+ optional bonus points) to
  // a single inactive member OR to the entire inactive list. Targets the
  // existing send_winback RPC per row.
  // CP-162: the gift can be points, a free REWARD (expiring redemption), or
  // both — via send_winback_v2, which also writes the (gated) notification.
  async function sendWeMissYou(target: Inactive | "all", bonusPoints: number, message: string, rewardId: string | null = null, expiresDays = 7) {
    const targets: Inactive[] = target === "all" ? inactive : [target];
    if (targets.length === 0) {
      toast.error("Nobody inactive right now");
      return;
    }
    setSending(target === "all" ? "all" : target.membership_id);
    const supabase = createClient();
    try {
      // Fire them in parallel — each call is an independent insert.
      await Promise.all(
        targets.map(t => supabase.rpc("send_winback_v2", {
          p_business_id: business.id,
          p_membership_id: t.membership_id,
          p_title: "We miss you ✨",
          p_body: message,
          p_bonus_points: bonusPoints > 0 ? bonusPoints : null,
          p_reward_id: rewardId,
          p_expires_days: expiresDays,
        }).then(r => { if (r.error) throw r.error; return r; }))
      );
      // CP-162: send_winback_v2 writes the notification row itself, and the
      // universal push-fanout trigger delivers the phone push from that row —
      // the old extra push-now call here would have been a second push.
      toast.success(
        target === "all"
          ? `Sent to ${targets.length} member${targets.length === 1 ? "" : "s"}`
          : `Sent to ${target.full_name ?? target.email ?? "member"}`
      );
      setComposer(null);
      loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't send");
    } finally {
      setSending(null);
    }
  }

  const brand = business.brand_colors.primary;

  return (
    <div className="space-y-6">
      {/* CP-171: one page of real numbers — KPIs, three social pillars,
          momentum, members / game / desk, most redeemed. Replaces the impact
          hero, with/without, Google card, engagement engine, ops row and
          embedded trends (all of which overlapped). */}
      <InsightsV3 business={business} />

      {/* ===================== TOP LOYAL MEMBERS ===================== */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <div>
            <h3 className="font-semibold">Top loyal members</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Live leaderboard — ranked by lifetime points earned + visits.
              Updates the moment someone scans in.
            </p>
          </div>
        </div>
        {top.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No member activity yet.</div>
        ) : (
          <div className="divide-y">
            {top.map((m, i) => (
              <div key={m.membership_id} className="flex items-center gap-3 px-5 py-3">
                <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-700 font-bold flex items-center justify-center text-sm">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{m.full_name ?? m.email ?? "Member"}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {m.visit_count} visit{m.visit_count === 1 ? "" : "s"}
                    {m.total_spent_cents != null && m.total_spent_cents > 0 && (
                      <> · ${(m.total_spent_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} spent</>
                    )}
                    {m.last_visit_at && <> · last seen {new Date(m.last_visit_at).toLocaleDateString()}</>}
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums" style={{ color: brand }}>
                  {m.lifetime_points.toLocaleString()} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================== INACTIVE LIST (CP-36 → CP-86) ===================== */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-4 w-4 text-zinc-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold">Inactive members ({inactiveDays}d+)</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                No check-in for {inactiveDays} days (including members who never
                checked in). Send a "we miss you" with a bonus to pull them back.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* CP-86: window picker — 60d default, shorter windows for newer businesses. */}
            <div className="flex rounded-full bg-zinc-100 p-0.5">
              {INACTIVE_WINDOWS.map(d => (
                <button
                  key={d}
                  onClick={() => setInactiveDays(d)}
                  className={
                    "px-2.5 py-1 rounded-full text-[11px] font-bold transition " +
                    (inactiveDays === d ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-800")
                  }
                >
                  {d}d
                </button>
              ))}
            </div>
            {inactive.length > 0 && (
              <Button
                size="sm"
                onClick={() => setComposer({ target: "all" })}
                disabled={sending === "all"}
                style={{ background: brand }}
                className="text-white text-xs shrink-0"
              >
                <MessageSquareHeart className="h-3 w-3 mr-1" />
                {sending === "all" ? "Sending…" : `Send to all ${inactive.length}`}
              </Button>
            )}
          </div>
        </div>
        {inactiveErr ? (
          <div className="p-6 text-center text-sm">
            <div className="font-semibold text-rose-600">Couldn't load the inactive list</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {inactiveErr} — if this mentions a missing function, apply the CP-86 SQL migration in Supabase.
            </div>
          </div>
        ) : inactive.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No one's been away {inactiveDays}+ days — nice retention 👏
          </div>
        ) : (
          <div className="divide-y">
            {inactive.map(m => (
              <div key={m.membership_id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{m.full_name ?? m.email ?? "Member"}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {m.last_visit_at
                      ? `Last seen ${new Date(m.last_visit_at).toLocaleDateString()} (${Math.round(Number(m.days_since_last))}d ago)`
                      : m.joined_at
                        ? `Never checked in · joined ${new Date(m.joined_at).toLocaleDateString()}`
                        : "Never checked in"}
                    {m.email && <> · {m.email}</>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setComposer({ target: m })}
                  disabled={sending === m.membership_id}
                >
                  {sending === m.membership_id ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Sending…</>
                  ) : (
                    <><MessageSquareHeart className="h-3 w-3 mr-1" /> We miss you</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {composer && (
        <WeMissYouComposer
          target={composer.target}
          totalIfAll={inactive.length}
          brand={brand}
          busy={
            composer.target === "all"
              ? sending === "all"
              : sending === composer.target.membership_id
          }
          onCancel={() => setComposer(null)}
          rewards={winbackRewards}
          onSend={(bonus, msg, rewardId, days) => sendWeMissYou(composer.target, bonus, msg, rewardId, days)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── We-miss-you composer ───────────────────────── */
/**
 * CP-36: lightweight modal for sending a win-back notification. The manager
 * picks how many bonus points to drop (default 50, 0 disables the bonus)
 * and optionally tweaks the body copy. Used both for a single inactive
 * member and for the send-to-all path — same UI, different recipient set.
 */
function WeMissYouComposer({
  target, totalIfAll, brand, busy, onCancel, onSend, rewards,
}: {
  target: Inactive | "all";
  totalIfAll: number;
  brand: string;
  busy: boolean;
  onCancel: () => void;
  onSend: (bonusPoints: number, message: string, rewardId: string | null, expiresDays: number) => void;
  rewards: { id: string; name: string; point_cost: number; image_url: string | null }[];
}) {
  const [bonus, setBonus] = useState<number>(50);
  // CP-162: optional free reward + how long the whole thing stays valid.
  const [rewardId, setRewardId] = useState<string | null>(null);
  const [days, setDays] = useState<number>(7);
  const [message, setMessage] = useState<string>(
    "Here's a little bonus to welcome you back — come see us soon."
  );
  const recipientLabel =
    target === "all"
      ? `${totalIfAll} inactive member${totalIfAll === 1 ? "" : "s"}`
      : (target.full_name ?? target.email ?? "this member");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <MessageSquareHeart className="h-4 w-4 text-rose-500" />
            We miss you
          </h2>
          <button
            onClick={onCancel}
            className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-zinc-50 border p-3 text-sm">
            Sending to <b>{recipientLabel}</b>.
          </div>

          {/* CP-162 · free reward */}
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Free reward (optional)</Label>
            <div className="mt-1 grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
              <button type="button" onClick={() => setRewardId(null)}
                className={`rounded-xl border px-2.5 py-2 text-left text-[12px] font-semibold ${rewardId === null ? "border-transparent text-white" : "bg-white hover:bg-zinc-50"}`}
                style={rewardId === null ? { background: brand } : undefined}>No reward — points / message only</button>
              {rewards.map(r => (
                <button key={r.id} type="button" onClick={() => setRewardId(r.id)}
                  className={`rounded-xl border px-2 py-1.5 text-left flex items-center gap-2 ${rewardId === r.id ? "border-transparent text-white" : "bg-white hover:bg-zinc-50"}`}
                  style={rewardId === r.id ? { background: brand } : undefined}>
                  {r.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={r.image_url} alt="" className="h-7 w-7 rounded-md object-cover shrink-0" />
                    : <span className="h-7 w-7 rounded-md bg-zinc-100 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold truncate">{r.name}</span>
                    <span className={`block text-[10px] ${rewardId === r.id ? "text-white/80" : "text-zinc-500"}`}>free · worth {r.point_cost.toLocaleString()} pts</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">A free redemption lands in their Rewards tab with a code. It expires — and they get a reminder before it does.</p>
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Valid for</Label>
            <div className="mt-1 flex gap-1.5">
              {[3, 7, 14].map(d => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={`rounded-full border px-3 h-8 text-[12px] font-bold ${days === d ? "border-transparent text-white" : "bg-white hover:bg-zinc-50"}`}
                  style={days === d ? { background: brand } : undefined}>{d} days</button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Bonus credits (0 = none)
            </Label>
            <Input
              type="number"
              min={0}
              max={5000}
              value={bonus}
              onChange={e => setBonus(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))}
              className="mt-1"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Awarded the moment they tap the notification. Use 0 if you
              just want to send a nudge with no points.
            </p>
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Message
            </Label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={240}
              rows={3}
              className="mt-1 w-full rounded-md border bg-white p-3 text-sm"
            />
            <div className="text-[10px] text-zinc-400 mt-1 text-right">{message.length}/240</div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          <button onClick={onCancel} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button
            onClick={() => onSend(bonus, message, rewardId, days)}
            disabled={busy || !message.trim()}
            className="rounded-full px-5 text-white"
            style={{ background: brand }}
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" /> Send</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */
