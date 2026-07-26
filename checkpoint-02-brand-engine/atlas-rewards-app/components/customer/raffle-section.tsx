"use client";
/**
 * RafflesSection — CP-85
 *
 * Customer-side raffle giveaway cards. Renders on the Rewards tab in the
 * same area as Limited offers (directly above LimitedOffersSection), using
 * the same card grammar — rounded-2xl, brand colors, badge chips — but
 * with a deliberately more premium treatment: brand-gradient ring + soft
 * glow, prize spotlight, live countdown, ticket motif. Exciting, not
 * childish.
 *
 * Entry flow (bullet-proofed against double charges):
 *   1. Tap Enter → confirmation sheet spells out the point cost.
 *   2. Confirm generates ONE entry_key (uuid) for this attempt; the button
 *      locks while in flight. Retries/refreshes replay the SAME key and
 *      the server returns the original entry instead of charging again
 *      (enter_raffle is idempotent on entry_key; charge + entry are one
 *      atomic transaction server-side).
 *   3. Success → "You're in!" flash + counts update. Balance updates via
 *      the existing membership realtime the Rewards tab already runs.
 *
 * Results:
 *   • Winner → full celebratory overlay (confetti — the ONLY place raffle
 *     confetti fires), prize, pickup instructions, optional claim deadline.
 *   • Non-winner → clean result sheet: "Giveaway Winner: <display name>",
 *     thank-you, clear "not selected this time".
 *   Auto-opens once per raffle (localStorage seen-set); tappable any time
 *   after via the card.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  AlertCircle, Clock, Crown, PartyPopper, Sparkles, Ticket, Trophy, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { HeadingByStyle } from "./section-elements";
import { badgeCss } from "@/lib/element-styles";
import {
  type CustomerRaffle, formatCountdown, formatRaffleTime, sweepDueRaffles,
} from "@/lib/raffles";
import type { Business } from "@/lib/types/database";

function newEntryKey(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `rk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const seenKey = (businessId: string) => `atlas-raffle-result-seen-${businessId}`;

function loadSeen(businessId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(seenKey(businessId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function markSeen(businessId: string, raffleId: string) {
  try {
    const s = loadSeen(businessId);
    s.add(raffleId);
    window.localStorage.setItem(seenKey(businessId), JSON.stringify([...s]));
  } catch { /* ignore */ }
}

export function RafflesSection({
  business, membershipId, points,
}: {
  business: Business;
  membershipId: string | null;
  /** Live balance from RewardsClient (already realtime-updated). */
  points: number;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CustomerRaffle[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState<CustomerRaffle | null>(null);
  const [entryKey, setEntryKey] = useState<string>("");
  const [entering, setEntering] = useState(false);
  const [entryErr, setEntryErr] = useState<string | null>(null);
  const [justEntered, setJustEntered] = useState<string | null>(null);
  const [resultFor, setResultFor] = useState<CustomerRaffle | null>(null);
  const autoOpened = useRef(false);

  const primary = business.brand_colors.primary;
  const sec = business.brand_colors.secondary || primary;

  // 1s tick — raffle countdowns show seconds in the final hour.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load + realtime on the raffles table (state flips live when the draw
  // happens or the owner edits times), + a lazy sweep so a raffle that
  // came due while the app was closed gets its winner drawn right now.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.rpc("list_active_raffles", { p_business_id: business.id });
      if (!cancelled) setRows((data ?? []) as CustomerRaffle[]);
    };
    sweepDueRaffles();
    load();
    const ch = supabase
      .channel(`raffles-${business.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "raffles", filter: `business_id=eq.${business.id}` },
        load,
      )
      .subscribe();
    // Gentle poll keeps total-entry counts fresh (other members entering).
    const poll = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(ch); };
  }, [business.id]);

  // When a countdown hits zero locally, nudge the backend draw + refetch.
  const dueIds = useMemo(
    () => (rows ?? []).filter(r => r.state === "open" && new Date(r.ends_at).getTime() <= now).map(r => r.id).join(","),
    [rows, now],
  );
  useEffect(() => {
    if (!dueIds) return;
    sweepDueRaffles();
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("list_active_raffles", { p_business_id: business.id });
      setRows((data ?? []) as CustomerRaffle[]);
    }, 2500);
    return () => clearTimeout(t);
  }, [dueIds, business.id]);

  // Auto-open the result ONCE per finished raffle the customer entered.
  useEffect(() => {
    if (!rows || autoOpened.current || typeof window === "undefined") return;
    const seen = loadSeen(business.id);
    const fresh = rows.find(r => r.state === "winner_selected" && r.my_entry_count > 0 && !seen.has(r.id));
    if (fresh) {
      autoOpened.current = true;
      setResultFor(fresh);
      markSeen(business.id, fresh.id);
    }
  }, [rows, business.id]);

  function openConfirm(r: CustomerRaffle) {
    setEntryErr(null);
    setEntryKey(newEntryKey()); // one key per attempt — retries reuse it
    setConfirming(r);
  }

  async function submitEntry() {
    if (!confirming || entering) return;
    setEntering(true);
    setEntryErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("enter_raffle", {
      p_raffle_id: confirming.id,
      p_entry_key: entryKey,
    });
    setEntering(false);
    if (error) {
      const msg = String(error.message || "");
      if (/ended/i.test(msg)) {
        setConfirming(null);
        toast.error("This raffle just ended — entries are closed.");
        sweepDueRaffles();
      } else if (/insufficient/i.test(msg)) {
        setEntryErr("Not enough points for this entry.");
      } else if (/join the rewards/i.test(msg)) {
        setEntryErr("Join the rewards program first to enter.");
      } else if (/limit reached/i.test(msg)) {
        setConfirming(null);
        toast.info("You've reached the entry limit for this raffle.");
      } else if (/full/i.test(msg)) {
        setConfirming(null);
        toast.info("This raffle is full — all entries are taken.");
      } else {
        setEntryErr(msg || "Couldn't enter — try again.");
      }
      return;
    }
    const row = (data as any)?.[0];
    const raffleId = confirming.id;
    setConfirming(null);
    setJustEntered(raffleId);
    setTimeout(() => setJustEntered(null), 2200);
    toast.success("You're in! Good luck 🎟️");
    // Optimistic local update; realtime/poll will confirm.
    setRows(prev => (prev ?? []).map(r =>
      r.id === raffleId
        ? { ...r, my_entry_count: row?.my_entry_count ?? r.my_entry_count + 1, total_entries: row?.total_entries ?? r.total_entries + 1 }
        : r,
    ));
  }

  if (!rows || rows.length === 0) return null;

  return (
    <>
      <section className="px-4 mt-5">
        <div className="flex items-center gap-2 mb-2.5">
          <HeadingByStyle styleId={business.heading_style} primary={primary} secondary={sec}>
            Giveaways
          </HeadingByStyle>
          <span
            className="inline-flex items-center gap-0.5 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full shadow-sm"
            style={badgeCss(business.badge_style, primary, sec)}
          >
            <Ticket className="h-2.5 w-2.5" /> Win big
          </span>
        </div>

        <div className="space-y-3">
          {rows.map(r => {
            const endMs = new Date(r.ends_at).getTime();
            const startMs = new Date(r.starts_at).getTime();
            const remain = Math.max(0, endMs - now);
            const untilStart = Math.max(0, startMs - now);
            const free = r.entry_cost_points <= 0;
            const canAfford = free || points >= r.entry_cost_points;
            const shortBy = free ? 0 : Math.max(0, r.entry_cost_points - points);
            const maxed = r.my_entry_count >= r.max_entries_per_customer;
            const full = r.total_entry_limit != null && r.total_entries >= r.total_entry_limit;
            const finished = r.state === "winner_selected" || r.state === "ended";
            const flash = justEntered === r.id;

            return (
              <div
                key={r.id}
                onClick={finished ? () => setResultFor(r) : undefined}
                className={`relative rounded-2xl overflow-hidden transition-transform ${flash ? "scale-[1.015]" : ""} ${finished ? "cursor-pointer active:scale-[0.99]" : ""}`}
                style={{
                  background: `linear-gradient(150deg, ${primary}0f 0%, #ffffff 38%, ${sec}14 100%)`,
                  boxShadow: `0 0 0 2px ${primary}55, 0 12px 28px -12px ${primary}66`,
                }}
              >
                {/* Image / hero strip */}
                <div className="relative h-32 w-full">
                  {r.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.image_url} alt={r.title} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)` }}>
                      <Trophy className="h-10 w-10 text-white/85" />
                    </div>
                  )}
                  {/* Darken bottom for legibility */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />

                  {/* Countdown / state badge — top right */}
                  <div className="absolute top-2.5 right-2.5">
                    {r.state === "open" && remain > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                        <Clock className="h-2.5 w-2.5" /> {formatCountdown(remain)} left
                      </span>
                    )}
                    {r.state === "scheduled" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">
                        <Clock className="h-2.5 w-2.5" /> Starts in {formatCountdown(untilStart)}
                      </span>
                    )}
                    {r.state === "ended" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">
                        Ended
                      </span>
                    )}
                    {r.state === "winner_selected" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-amber-400 text-amber-950 shadow">
                        <Crown className="h-2.5 w-2.5" /> Winner Selected
                      </span>
                    )}
                  </div>

                  {/* Entry cost badge — top left */}
                  <div className="absolute top-2.5 left-2.5">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full text-white shadow-md"
                      style={{ background: free ? "linear-gradient(135deg, #10b981, #059669)" : `linear-gradient(135deg, ${primary}, ${sec})` }}
                    >
                      <Ticket className="h-2.5 w-2.5" />
                      {free ? "FREE ENTRY" : `${r.entry_cost_points.toLocaleString()} pts / entry`}
                    </span>
                  </div>

                  {/* Prize spotlight — bottom of image */}
                  <div className="absolute bottom-2 left-3 right-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/75">Prize</div>
                    <div className="text-white font-extrabold text-base leading-tight drop-shadow-sm truncate">🏆 {r.prize}</div>
                  </div>
                </div>

                {/* Body */}
                <div className="p-3.5">
                  <div className="text-sm font-bold leading-tight text-zinc-900">{r.title}</div>
                  {r.description && (
                    <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug line-clamp-2">{r.description}</div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                      {r.total_entries.toLocaleString()} entr{r.total_entries === 1 ? "y" : "ies"}
                      {r.total_entry_limit != null && ` / ${r.total_entry_limit.toLocaleString()}`}
                    </span>
                    {r.my_entry_count > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full text-white"
                        style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
                      >
                        <Sparkles className="h-2.5 w-2.5" /> You: {r.my_entry_count} entr{r.my_entry_count === 1 ? "y" : "ies"}
                      </span>
                    )}
                    {r.max_entries_per_customer > 1 && !finished && (
                      <span className="text-[10px] font-semibold text-zinc-400">
                        max {r.max_entries_per_customer} per member
                      </span>
                    )}
                  </div>

                  {/* CTA row */}
                  <div className="mt-2.5">
                    {r.state === "open" && (
                      maxed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Sparkles className="h-3 w-3" /> You're in — good luck!
                        </span>
                      ) : full ? (
                        <span className="text-[11px] font-bold text-zinc-500">All entries are taken — this one's full.</span>
                      ) : !membershipId ? (
                        <span className="text-[11px] font-bold text-zinc-500">Join the rewards program to enter.</span>
                      ) : canAfford ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openConfirm(r); }}
                          className={`inline-flex items-center gap-1.5 text-[12px] font-extrabold px-4 py-2 rounded-full text-white active:scale-[0.97] transition ${flash ? "animate-pulse" : ""}`}
                          style={{
                            background: `linear-gradient(135deg, ${primary}, ${sec})`,
                            boxShadow: `var(--atlas-cta-glow, 0 6px 16px -6px ${primary}aa)`,
                          }}
                        >
                          <Ticket className="h-3.5 w-3.5" />
                          {free ? "Enter free" : "Enter"}
                        </button>
                      ) : (
                        <div>
                          <button type="button" disabled
                            className="inline-flex items-center gap-1.5 text-[12px] font-extrabold px-4 py-2 rounded-full bg-zinc-200 text-zinc-400 cursor-not-allowed">
                            <Ticket className="h-3.5 w-3.5" /> Enter
                          </button>
                          <div className="text-[10px] font-bold text-zinc-500 mt-1">
                            You need {shortBy.toLocaleString()} more points to enter.
                          </div>
                        </div>
                      )
                    )}
                    {r.state === "scheduled" && (
                      <span className="text-[11px] font-bold text-zinc-500">
                        Opens {formatRaffleTime(r.starts_at, r.timezone)}
                      </span>
                    )}
                    {r.state === "ended" && (
                      <span className="text-[11px] font-bold text-zinc-500">
                        {r.total_entries > 0 ? "Entries closed — drawing the winner…" : "Ended — no entries this time."}
                      </span>
                    )}
                    {r.state === "winner_selected" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-700">
                        <Crown className="h-3 w-3" />
                        {r.i_won ? "YOU WON — tap to see!" : `Giveaway Winner: ${r.winner_display_name ?? "Member"} · tap for details`}
                      </span>
                    )}
                  </div>

                  {r.terms && !finished && (
                    <div className="text-[9px] text-zinc-400 mt-2 leading-snug">{r.terms}</div>
                  )}
                </div>

                {/* "You're in" flash overlay (small celebration — confetti is
                    reserved for the winner screen) */}
                {flash && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className="rounded-full px-4 py-2 text-white text-sm font-extrabold shadow-xl flex items-center gap-1.5"
                      style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
                    >
                      <Sparkles className="h-4 w-4" /> Entry #{(rows.find(x => x.id === r.id)?.my_entry_count ?? 1)} in!
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Entry confirmation sheet ── */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="text-lg font-bold">Enter this giveaway?</h2>
              <button onClick={() => setConfirming(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <div className="rounded-2xl p-4 text-white text-center"
                style={{ background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)` }}>
                <Trophy className="h-8 w-8 mx-auto text-white/90" />
                <div className="font-extrabold text-lg mt-1">{confirming.prize}</div>
                <div className="text-[11px] text-white/80 mt-0.5">{confirming.title}</div>
              </div>

              <div className="mt-5 rounded-xl border bg-zinc-50 p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cost per entry</span>
                  <span className="font-bold">
                    {confirming.entry_cost_points > 0
                      ? `${confirming.entry_cost_points.toLocaleString()} pts`
                      : "Free"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Your balance now</span>
                  <span className="font-medium">{points.toLocaleString()} pts</span>
                </div>
                {confirming.entry_cost_points > 0 && (
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">After this entry</span>
                    <span className="font-bold" style={{ color: primary }}>
                      {Math.max(0, points - confirming.entry_cost_points).toLocaleString()} pts
                    </span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground mt-3 text-center">
                {confirming.entry_cost_points > 0
                  ? "Points are deducted only once your entry is recorded. "
                  : ""}
                Winner is drawn automatically when the countdown ends
                {confirming.ends_at ? ` (${formatRaffleTime(confirming.ends_at, confirming.timezone)})` : ""}.
              </p>

              {entryErr && (
                <p className="text-sm text-rose-600 mt-3 flex items-start gap-1.5">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {entryErr}
                </p>
              )}
            </div>
            <div className="p-5 border-t flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={entering}
                className="flex-1 rounded-xl border bg-white py-3 text-sm font-semibold"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={submitEntry}
                disabled={entering}
                className="flex-1 rounded-xl py-3 text-sm font-extrabold text-white disabled:opacity-70"
                style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
              >
                {entering ? "Entering…" : confirming.entry_cost_points > 0
                  ? `Confirm — ${confirming.entry_cost_points.toLocaleString()} pts`
                  : "Confirm free entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Result overlay ── */}
      {resultFor && (
        <RaffleResultOverlay
          raffle={resultFor}
          business={business}
          onClose={() => setResultFor(null)}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Result overlay — celebratory for the winner, gracious for everyone else
 * ──────────────────────────────────────────────────────────────────── */

function RaffleResultOverlay({
  raffle, business, onClose,
}: {
  raffle: CustomerRaffle;
  business: Business;
  onClose: () => void;
}) {
  const primary = business.brand_colors.primary;
  const sec = business.brand_colors.secondary || primary;
  const won = raffle.i_won;

  // Confetti ONLY on the winner screen (design requirement).
  useEffect(() => {
    if (!won) return;
    const fire = (origin: { x: number; y: number }) => confetti({
      particleCount: 90,
      spread: 75,
      origin,
      colors: ["#ffffff", "#fde68a", "#fda4af", "#a5b4fc", "#86efac"],
    });
    fire({ x: 0.25, y: 0.45 });
    const t1 = setTimeout(() => fire({ x: 0.5, y: 0.35 }), 180);
    const t2 = setTimeout(() => fire({ x: 0.75, y: 0.45 }), 360);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [won]);

  const claimBy =
    won && raffle.claim_deadline_days && raffle.drawn_at
      ? new Date(new Date(raffle.drawn_at).getTime() + raffle.claim_deadline_days * 86400_000)
      : null;

  if (won) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto"
        style={{ background: `linear-gradient(160deg, ${primary} 0%, ${sec} 100%)` }}>
        <div className="my-auto flex flex-col items-center text-center w-full max-w-xs">
          <PartyPopper className="h-10 w-10 text-white/90" />
          <h2 className="text-white font-black tracking-tight mt-3" style={{ fontSize: "clamp(40px, 12vw, 56px)" }}>
            You Won!
          </h2>
          <p className="text-white/90 mt-1 text-sm font-semibold">{raffle.title}</p>

          <div className="mt-5 w-full rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/70">Your prize</div>
            <div className="text-white font-extrabold text-xl mt-1">🏆 {raffle.prize}</div>
          </div>

          <div className="mt-3 w-full rounded-2xl bg-white p-4 text-left">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">How to claim</div>
            <p className="text-sm text-zinc-700 mt-1 leading-snug">
              Show this screen at {business.name} and the team will get your prize sorted.
            </p>
            {claimBy && (
              <p className="text-[11px] font-bold text-rose-600 mt-2">
                Claim by {claimBy.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
            {raffle.terms && (
              <p className="text-[9px] text-zinc-400 mt-2 leading-snug">{raffle.terms}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white h-12 text-base font-bold"
          >
            Amazing!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">Giveaway ended</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 text-center">
          <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center bg-amber-100">
            <Crown className="h-7 w-7 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold mt-3">{raffle.title}</h3>
          <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Giveaway Winner</div>
            <div className="text-lg font-extrabold mt-1" style={{ color: primary }}>
              {raffle.winner_display_name ?? "A lucky member"}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Prize: {raffle.prize}</div>
          </div>
          {raffle.my_entry_count > 0 ? (
            <p className="text-sm text-zinc-600 mt-4 leading-snug">
              You weren't selected this time — but thank you for entering!
              Keep earning points; the next giveaway could be yours. 💪
            </p>
          ) : (
            <p className="text-sm text-zinc-600 mt-4 leading-snug">
              This giveaway has ended. Keep an eye on the Rewards tab for the next one!
            </p>
          )}
        </div>
        <div className="p-5 border-t">
          <button
            onClick={onClose}
            className="w-full rounded-2xl py-3 text-sm font-extrabold text-white"
            style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
