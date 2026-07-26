"use client";
/**
 * raffle-manager.tsx — CP-85
 *
 * Everything staff-side for the Raffle Giveaway offer type. NOT a new
 * top-level feature: these pieces render INSIDE the existing OffersManager
 * (One-Time offers tab) — raffles are just another thing you can create
 * from the same "+ Add offer" button.
 *
 *   <RaffleEditor/>      create/edit modal (title, prize, image, entry
 *                        cost, start/end + time zone, limits, terms,
 *                        winner display format)
 *   <RaffleList/>        rows in the offers list w/ live status chips
 *   <RaffleAdminModal/>  detail: stats, participant search, entry counts +
 *                        timestamps, winner + claim status, cancel (with
 *                        auto-refund warning), manager-only logged redraw
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Ban, CheckCircle2, Clock, Crown, Edit2, RefreshCw,
  Save, Search, Ticket, Trophy, Users, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "./image-uploader";
import {
  type AdminRaffle, type RaffleParticipant, type WinnerDisplay,
  RAFFLE_STATE_META, RAFFLE_TIMEZONES, browserTimezone, formatRaffleTime,
  sweepDueRaffles, utcToZonedLocal, zonedToUtcIso,
} from "@/lib/raffles";
import type { Business } from "@/lib/types/database";

/* ─────────────────────────────────────────────────────────────────────
 * Editor modal
 * ──────────────────────────────────────────────────────────────────── */

type EditorDraft = {
  id?: string;
  title: string;
  description: string;
  image_url: string | null;
  prize: string;
  entry_cost_points: number;
  starts_local: string;   // wall time in `timezone`
  ends_local: string;
  timezone: string;
  max_entries_per_customer: number;
  total_entry_limit: number | null;
  terms: string;
  winner_display: WinnerDisplay;
  claim_deadline_days: number | null;
};

function draftFrom(raffle: AdminRaffle | null): EditorDraft {
  if (raffle) {
    return {
      id: raffle.id,
      title: raffle.title,
      description: raffle.description ?? "",
      image_url: raffle.image_url,
      prize: raffle.prize,
      entry_cost_points: raffle.entry_cost_points,
      starts_local: utcToZonedLocal(raffle.starts_at, raffle.timezone),
      ends_local: utcToZonedLocal(raffle.ends_at, raffle.timezone),
      timezone: raffle.timezone,
      max_entries_per_customer: raffle.max_entries_per_customer,
      total_entry_limit: raffle.total_entry_limit,
      terms: raffle.terms ?? "",
      winner_display: raffle.winner_display,
      claim_deadline_days: raffle.claim_deadline_days,
    };
  }
  // Defaults: opens now, runs 7 days, browser's zone.
  const tz = browserTimezone();
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86400_000);
  return {
    title: "",
    description: "",
    image_url: null,
    prize: "",
    entry_cost_points: 500,
    starts_local: utcToZonedLocal(now.toISOString(), tz),
    ends_local: utcToZonedLocal(end.toISOString(), tz),
    timezone: tz,
    max_entries_per_customer: 1,
    total_entry_limit: null,
    terms: "",
    winner_display: "first_last_initial",
    claim_deadline_days: 14,
  };
}

export function RaffleEditor({
  business, raffle, onClose, onSaved,
}: {
  business: Business;
  /** null = create new */
  raffle: AdminRaffle | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<EditorDraft>(() => draftFrom(raffle));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tzOptions = useMemo(() => {
    const list = [...RAFFLE_TIMEZONES];
    if (!list.some(t => t.value === d.timezone)) {
      list.unshift({ value: d.timezone, label: d.timezone.replace(/_/g, " ") });
    }
    return list;
  }, [d.timezone]);

  /** Switching zones keeps the WALL TIMES the owner typed — "7 PM" stays
   *  7 PM in the newly-picked zone. */
  function setTimezone(tz: string) {
    setD(prev => ({ ...prev, timezone: tz }));
  }

  async function save() {
    setErr(null);
    if (!d.title.trim()) { setErr("Give the raffle a title."); return; }
    if (!d.prize.trim()) { setErr("Describe the prize."); return; }
    let startsIso: string, endsIso: string;
    try {
      startsIso = zonedToUtcIso(d.starts_local, d.timezone);
      endsIso = zonedToUtcIso(d.ends_local, d.timezone);
    } catch {
      setErr("Check the start and end dates."); return;
    }
    if (new Date(endsIso) <= new Date(startsIso)) {
      setErr("End time must be after the start time."); return;
    }

    setSaving(true);
    const supabase = createClient();
    const isNew = !d.id;
    const { data, error } = await supabase.rpc("upsert_raffle", {
      p_id: d.id ?? null,
      p_business_id: business.id,
      p_title: d.title.trim(),
      p_description: d.description.trim() || null,
      p_image_url: d.image_url,
      p_prize: d.prize.trim(),
      p_entry_cost_points: Math.max(0, Math.round(d.entry_cost_points || 0)),
      p_starts_at: startsIso,
      p_ends_at: endsIso,
      p_timezone: d.timezone,
      p_max_entries_per_customer: Math.max(1, Math.round(d.max_entries_per_customer || 1)),
      p_total_entry_limit: d.total_entry_limit ? Math.max(1, Math.round(d.total_entry_limit)) : null,
      p_terms: d.terms.trim() || null,
      p_winner_display: d.winner_display,
      p_claim_deadline_days: d.claim_deadline_days ? Math.max(1, Math.round(d.claim_deadline_days)) : null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // CP-85: announce a brand-new raffle through the SAME proven push path
    // featured offers use (respects the business's master toggle).
    // Fire-and-forget so it never blocks the save.
    if (isNew) {
      fetch("/api/notifications/announce-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: business.id,
          offer_id: data ?? null,
          title: `🎟️ ${d.title.trim()} — win ${d.prize.trim()}`,
          description: d.entry_cost_points > 0
            ? `${d.entry_cost_points.toLocaleString()} points per entry. Enter on the Rewards tab!`
            : "Free entry — enter on the Rewards tab!",
          kind: "raffle",
        }),
      }).catch(() => { /* in-app card is the safety net */ });
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="font-bold flex items-center gap-2">
            <Ticket className="h-4 w-4 text-violet-600" />
            {d.id ? "Edit raffle giveaway" : "New raffle giveaway"}
          </h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Promotional image (optional)</Label>
            <ImageUploader
              bucket="offer-images"
              pathPrefix={business.id}
              value={d.image_url}
              onChange={(url) => setD({ ...d, image_url: url })}
              aspectClass="aspect-video"
              label="Raffle"
              library={{ category: "offer", industry: business.industry }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Raffle title</Label>
            <Input value={d.title} onChange={e => setD({ ...d, title: e.target.value })}
              placeholder="Summer Giveaway" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description (optional)</Label>
            <Input value={d.description} onChange={e => setD({ ...d, description: e.target.value })}
              placeholder="One lucky member takes it home" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Prize</Label>
            <Input value={d.prize} onChange={e => setD({ ...d, prize: e.target.value })}
              placeholder="Free 60-minute massage" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Entry cost (points per entry)</Label>
            <Input type="number" min={0} value={String(d.entry_cost_points)}
              onChange={e => setD({ ...d, entry_cost_points: Number(e.target.value) })} />
            <p className="text-[11px] text-muted-foreground">
              {(!d.entry_cost_points || d.entry_cost_points <= 0)
                ? "0 points — shows as a Free Entry raffle."
                : `Each entry deducts ${Number(d.entry_cost_points).toLocaleString()} points.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Starts</Label>
              <Input type="datetime-local" value={d.starts_local}
                onChange={e => setD({ ...d, starts_local: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ends (winner drawn)</Label>
              <Input type="datetime-local" value={d.ends_local}
                onChange={e => setD({ ...d, ends_local: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Time zone</Label>
            <select
              value={d.timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-white px-3 text-sm"
            >
              {tzOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Times above are in this zone. Stored in UTC — the countdown is exact everywhere.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max entries per customer</Label>
              <Input type="number" min={1} value={String(d.max_entries_per_customer)}
                onChange={e => setD({ ...d, max_entries_per_customer: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Total entry limit (optional)</Label>
              <Input type="number" min={1} placeholder="Unlimited"
                value={d.total_entry_limit == null ? "" : String(d.total_entry_limit)}
                onChange={e => setD({ ...d, total_entry_limit: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Terms / eligibility (optional)</Label>
            <Input value={d.terms} onChange={e => setD({ ...d, terms: e.target.value })}
              placeholder="Must be 18+. Prize pickup in store." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Winner name display</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => setD({ ...d, winner_display: "first_last_initial" })}
                className={`rounded-lg border p-2.5 text-left text-xs font-semibold transition ${
                  d.winner_display === "first_last_initial" ? "border-violet-400 bg-violet-50 text-violet-800" : "bg-white text-zinc-600"
                }`}>
                First name + initial
                <div className="text-[10px] font-normal text-muted-foreground mt-0.5">"Khaled M."</div>
              </button>
              <button type="button"
                onClick={() => setD({ ...d, winner_display: "full_name" })}
                className={`rounded-lg border p-2.5 text-left text-xs font-semibold transition ${
                  d.winner_display === "full_name" ? "border-violet-400 bg-violet-50 text-violet-800" : "bg-white text-zinc-600"
                }`}>
                Full name
                <div className="text-[10px] font-normal text-muted-foreground mt-0.5">"Khaled Mansour"</div>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Claim deadline (days after draw, optional)</Label>
            <Input type="number" min={1} placeholder="No deadline"
              value={d.claim_deadline_days == null ? "" : String(d.claim_deadline_days)}
              onChange={e => setD({ ...d, claim_deadline_days: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>

          <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-[11px] text-violet-900 flex items-start gap-2">
            <Trophy className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              When the end time hits, entries close and <strong>one winner is drawn automatically and
              securely on the server</strong>. You and your front-desk team get notified; the winner
              gets a celebration screen, everyone else sees the result.
            </div>
          </div>
        </div>

        {err && (
          <div className="px-5 pb-2 text-xs text-rose-700 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="p-5 border-t flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : d.id ? "Save changes" : "Launch raffle"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * List rows (rendered inside OffersManager, below regular offers)
 * ──────────────────────────────────────────────────────────────────── */

export function RaffleList({
  business, refreshTick, onChanged,
}: {
  business: Business;
  /** bump to refetch (parent bumps after editor saves) */
  refreshTick: number;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<AdminRaffle[]>([]);
  const [editing, setEditing] = useState<AdminRaffle | null>(null);
  const [managing, setManaging] = useState<AdminRaffle | null>(null);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_raffles_for_business", { p_business_id: business.id });
    if (error) { console.error("raffles load:", error.message); return; }
    setRows((data ?? []) as AdminRaffle[]);
  }

  useEffect(() => {
    // Draw any raffle that came due while nobody was looking, THEN load.
    sweepDueRaffles();
    const t = setTimeout(load, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id, refreshTick]);

  if (rows.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <Ticket className="h-3 w-3" /> Raffle giveaways
        </div>
        <div className="space-y-2">
          {rows.map(r => {
            const meta = RAFFLE_STATE_META[r.state] ?? RAFFLE_STATE_META.ended;
            return (
              <div key={r.id} className="rounded-xl border p-3"
                style={{ background: "linear-gradient(135deg, #faf5ff 0%, #f5f3ff 60%, #fdf4ff 100%)", borderColor: "#ddd6fe" }}>
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-white border border-violet-200">
                    {r.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-violet-50">
                        <Ticket className="h-5 w-5 text-violet-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-sm truncate">{r.title}</div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.chip}`}>{meta.label}</span>
                      {r.state === "winner_selected" && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-amber-300 text-amber-700 flex items-center gap-1">
                          <Crown className="h-2.5 w-2.5" /> {r.winner_display_name ?? "Winner"}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      🏆 {r.prize} · {r.entry_cost_points > 0 ? `${r.entry_cost_points.toLocaleString()} pts/entry` : "Free entry"} · {r.total_entries} entr{r.total_entries === 1 ? "y" : "ies"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {r.state === "scheduled" ? "Opens" : "Ends"} {formatRaffleTime(r.state === "scheduled" ? r.starts_at : r.ends_at, r.timezone)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.state === "scheduled" || r.state === "open" ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)} title="Edit">
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setManaging(r)}>
                      <Users className="h-3 w-3 mr-1" /> Entries
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <RaffleEditor business={business} raffle={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { load(); onChanged?.(); }} />
      )}
      {managing && (
        <RaffleAdminModal business={business} raffle={managing}
          onClose={() => setManaging(null)}
          onChanged={() => { load(); onChanged?.(); }} />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Admin detail modal — stats, participants, winner, claim, cancel, redraw
 * ──────────────────────────────────────────────────────────────────── */

export function RaffleAdminModal({
  business, raffle, onClose, onChanged,
}: {
  business: Business;
  raffle: AdminRaffle;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [r, setR] = useState<AdminRaffle>(raffle);
  const [participants, setParticipants] = useState<RaffleParticipant[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [redrawReason, setRedrawReason] = useState("");
  const [isManager, setIsManager] = useState(false);

  async function reload() {
    const supabase = createClient();
    const [{ data: list }, { data: parts }] = await Promise.all([
      supabase.rpc("list_raffles_for_business", { p_business_id: business.id }),
      supabase.rpc("raffle_participants", { p_raffle_id: raffle.id, p_business_id: business.id }),
    ]);
    const fresh = ((list ?? []) as AdminRaffle[]).find(x => x.id === raffle.id);
    if (fresh) setR(fresh);
    setParticipants((parts ?? []) as RaffleParticipant[]);
  }

  useEffect(() => {
    reload();
    const supabase = createClient();
    supabase.rpc("current_app_role", { p_business_id: business.id }).then(({ data }) => {
      setIsManager(data === "business_manager" || data === "agency_admin");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raffle.id]);

  const filtered = useMemo(() => {
    if (!participants) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return participants;
    return participants.filter(p => p.full_name.toLowerCase().includes(needle));
  }, [participants, q]);

  async function setClaim(status: "not_claimed" | "claimed" | "expired") {
    setBusy("claim"); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_raffle_claim_status", {
      p_raffle_id: r.id, p_business_id: business.id, p_status: status,
    });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    reload(); onChanged();
  }

  async function doCancel() {
    setBusy("cancel"); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_raffle", {
      p_raffle_id: r.id, p_business_id: business.id,
    });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setConfirmCancel(false);
    reload(); onChanged();
  }

  async function doRedraw() {
    if (!redrawReason.trim()) { setErr("A reason is required for a redraw — it goes in the audit log."); return; }
    setBusy("redraw"); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("redraw_raffle", {
      p_raffle_id: r.id, p_business_id: business.id, p_reason: redrawReason.trim(),
    });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setRedrawOpen(false); setRedrawReason("");
    reload(); onChanged();
  }

  const meta = RAFFLE_STATE_META[r.state] ?? RAFFLE_STATE_META.ended;
  const paidEntries = r.entry_cost_points > 0;
  const canCancel = r.state === "scheduled" || r.state === "open";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 flex items-center justify-between border-b">
          <div className="min-w-0">
            <h2 className="font-bold truncate flex items-center gap-2">
              <Ticket className="h-4 w-4 text-violet-600 shrink-0" /> {r.title}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.chip}`}>{meta.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {formatRaffleTime(r.starts_at, r.timezone)} → {formatRaffleTime(r.ends_at, r.timezone)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Entries" value={r.total_entries.toLocaleString()} />
            <StatBox label="Participants" value={r.unique_participants.toLocaleString()} />
            <StatBox label="Entry cost" value={paidEntries ? `${r.entry_cost_points.toLocaleString()} pts` : "Free"} />
          </div>

          {/* Winner block */}
          {r.state === "winner_selected" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-600" />
                <div className="font-bold text-sm text-amber-900">Winner: {r.winner_display_name ?? "Member"}</div>
              </div>
              <div className="text-[11px] text-amber-800 mt-1">
                Drawn {r.drawn_at ? formatRaffleTime(r.drawn_at, r.timezone) : "—"} · Prize: {r.prize}
              </div>
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">Prize claim status</div>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    ["not_claimed", "Not Claimed"],
                    ["claimed", "Claimed"],
                    ["expired", "Expired"],
                  ] as const).map(([id, label]) => (
                    <button key={id} type="button" disabled={busy === "claim"}
                      onClick={() => setClaim(id)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition ${
                        r.prize_claim_status === id
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-amber-800 border-amber-300 hover:bg-amber-100"
                      }`}>
                      {r.prize_claim_status === id && <CheckCircle2 className="h-3 w-3 inline mr-1 -mt-0.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {isManager && r.prize_claim_status !== "claimed" && (
                <div className="mt-3 border-t border-amber-200 pt-3">
                  {!redrawOpen ? (
                    <button type="button" onClick={() => setRedrawOpen(true)}
                      className="text-[11px] font-semibold text-amber-800 inline-flex items-center gap-1 hover:underline">
                      <RefreshCw className="h-3 w-3" /> Administrative redraw…
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-900">
                        Redraw picks a new winner (excluding the current one) and is <strong>permanently logged</strong> with
                        your name and reason. Use only if the winner is ineligible or didn't claim.
                      </p>
                      <Input value={redrawReason} onChange={e => setRedrawReason(e.target.value)}
                        placeholder="Reason (required — goes in the audit log)" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setRedrawOpen(false); setRedrawReason(""); }}>Cancel</Button>
                        <Button size="sm" onClick={doRedraw} disabled={busy === "redraw"}>
                          <RefreshCw className="h-3 w-3 mr-1" /> {busy === "redraw" ? "Drawing…" : "Confirm redraw"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {r.state === "ended" && r.total_entries === 0 && (
            <div className="rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-600">
              This raffle ended with no eligible entries — no winner was drawn.
            </div>
          )}

          {/* Participants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Participants</div>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name…"
                  className="h-8 w-44 rounded-lg border border-input bg-white pl-8 pr-2 text-xs" />
              </div>
            </div>
            {filtered === null ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {q ? "No participants match that search." : "No entries yet."}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {filtered.map(p => (
                  <div key={p.membership_id}
                    className={`rounded-lg border p-2.5 flex items-center gap-2.5 ${p.is_winner ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
                    <div className="h-8 w-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                      {p.full_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                        {p.full_name}
                        {p.is_winner && <Crown className="h-3 w-3 text-amber-500" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Last entry {new Date(p.last_entry_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold">{p.entry_count} entr{p.entry_count === 1 ? "y" : "ies"}</div>
                      {paidEntries && (
                        <div className="text-[10px] text-muted-foreground">{Number(p.points_spent).toLocaleString()} pts</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cancel zone */}
          {canCancel && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
              {!confirmCancel ? (
                <button type="button" onClick={() => setConfirmCancel(true)}
                  className="text-[11px] font-semibold text-rose-700 inline-flex items-center gap-1 hover:underline">
                  <Ban className="h-3 w-3" /> Cancel this raffle…
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-rose-900 flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Cancelling ends this raffle immediately with <strong>no winner</strong>
                      {paidEntries
                        ? <> and <strong>automatically refunds every entry's points</strong> ({r.total_entries.toLocaleString()} entr{r.total_entries === 1 ? "y" : "ies"} across {r.unique_participants.toLocaleString()} member{r.unique_participants === 1 ? "" : "s"}).</>
                        : "."}
                      {" "}Entrants are notified. This can't be undone.
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>Keep raffle</Button>
                    <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={doCancel} disabled={busy === "cancel"}>
                      <Ban className="h-3 w-3 mr-1" /> {busy === "cancel" ? "Cancelling…" : "Cancel & refund"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {err && (
            <div className="text-xs text-rose-700 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-zinc-50 p-3 text-center">
      <div className="text-base font-extrabold tabular-nums">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
