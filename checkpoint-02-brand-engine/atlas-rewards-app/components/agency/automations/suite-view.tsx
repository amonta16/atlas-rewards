"use client";
/**
 * SuiteView — CP-217 · the Atlas Med Spa Automation Suite (default view of
 * /agency/automations for med spas). One calm list of the 14 research-backed
 * journeys, grouped by the patient's lifecycle; each row opens the journey
 * detail (flowchart + realistic previews + inline word/points editing).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Clock3, Gift, HeartPulse, Loader2, Mail, PartyPopper, RefreshCw, RotateCcw, ShoppingBag, Smartphone, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { hub, EngineError } from "@/lib/automations/client";
import type { BusinessOption, HubSummary, SuiteGroup, SuiteJourney, SuitePreviewData } from "@/lib/automations/types";
import { DashboardStrip } from "./dashboard-strip";
import { BusinessPicker, HubTitle, ViewSwitch } from "./hub-header";
import { JourneyDetail } from "./journey-detail";

export const GROUPS: { id: SuiteGroup; label: string; sub: string; icon: React.ReactNode; color: string; soft: string }[] = [
  { id: "get_in", label: "Get them in", sub: "From signup to a first booked visit", icon: <UserPlus className="h-4 w-4" />, color: "#0B5FD6", soft: "#eaf1fc" },
  { id: "convert", label: "Convert", sub: "Turn interest into orders, bookings and members", icon: <ShoppingBag className="h-4 w-4" />, color: "#06318F", soft: "#e8edf8" },
  { id: "care", label: "Care", sub: "Aftercare, reviews, reminders and rebooking", icon: <HeartPulse className="h-4 w-4" />, color: "#047857", soft: "#e8f4ef" },
  { id: "come_back", label: "Come back", sub: "Win back quiet patients and unused rewards", icon: <RotateCcw className="h-4 w-4" />, color: "#b45309", soft: "#fbf3e6" },
  { id: "celebrate", label: "Celebrate", sub: "Birthdays, referrals and gifts", icon: <PartyPopper className="h-4 w-4" />, color: "#9d174d", soft: "#fcecf3" },
];

const FALLBACK_PREVIEW = (name: string): SuitePreviewData => ({
  sample: { first_name: "Jane", points: 340, points_remaining: 160, days_since_last_visit: 84, treatment: "HydraFacial", item: "HydraFacial Signature", offer_name: "$25 off your next facial" },
  brand: { name, logo_url: null, primary: "#0B5FD6", hero_url: null },
  sender: { from_name: name, from_address: "hello@atlas-engine.app", reply_to: null },
});

export function SuiteView({ businesses, business }: { businesses: BusinessOption[]; business: BusinessOption }) {
  const [summary, setSummary] = useState<HubSummary | null>(null);
  const [rows, setRows] = useState<SuiteJourney[] | null>(null);
  const [preview, setPreview] = useState<SuitePreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);

  const fail = (e: unknown) => setError(e instanceof EngineError ? e.message : e instanceof Error ? e.message : "Something went wrong.");

  const load = useCallback(async () => {
    setError(null);
    hub.summary(business.id).then(setSummary).catch(() => setSummary(null));
    hub.suitePreview(business.id).then(setPreview).catch(() => setPreview(FALLBACK_PREVIEW(business.name)));
    try { setRows(await hub.suite(business.id)); } catch (e) { fail(e); setRows([]); }
  }, [business.id, business.name]);

  useEffect(() => { setRows(null); setOpenKey(null); load(); }, [load]);

  const toggle = async (j: SuiteJourney, enabled: boolean) => {
    setRows((rs) => rs?.map((r) => (r.key === j.key ? { ...r, enabled } : r)) ?? rs);
    setPending((p) => new Set(p).add(j.key));
    try { await hub.suiteToggle(business.id, j.key, enabled); hub.summary(business.id).then(setSummary).catch(() => {}); }
    catch (e) { setRows((rs) => rs?.map((r) => (r.key === j.key ? { ...r, enabled: !enabled } : r)) ?? rs); fail(e); }
    finally { setPending((p) => { const n = new Set(p); n.delete(j.key); return n; }); }
  };
  const replaceRow = (j: SuiteJourney) => setRows((rs) => rs?.map((r) => (r.key === j.key ? j : r)) ?? rs);
  const install = async () => { setInstalling(true); try { await hub.suiteInstall(business.id); await load(); } catch (e) { fail(e); } finally { setInstalling(false); } };

  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, rows: (rows ?? []).filter((r) => r.grp === g.id) })).filter((g) => g.rows.length), [rows]);
  const onCount = rows?.filter((r) => r.enabled).length ?? 0;
  const open = rows?.find((r) => r.key === openKey) ?? null;
  const pv = preview ?? FALLBACK_PREVIEW(business.name);

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <div className="px-8 pb-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><HubTitle /><BusinessPicker businesses={businesses} business={business} view="suite" /></div>
          <ViewSwitch business={business} view="suite" />
        </div>
        {error && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button onClick={load} className="flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"><RefreshCw className="h-3 w-3" />Retry</button>
          </div>
        )}
        <div className="mt-3"><DashboardStrip s={summary} loading={!summary && !error} /></div>
      </div>

      {open ? (
        <JourneyDetail business={business} journey={open} preview={pv} onBack={() => setOpenKey(null)} onToggle={(v) => toggle(open, v)} togglePending={pending.has(open.key)} onChanged={replaceRow} onReload={load} />
      ) : (
        <div className="mx-8">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-1 pt-3">
            <div className="max-w-[640px]">
              <h2 className="text-[16px] font-semibold text-[#14213d]">The Atlas med spa suite</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">Journeys built from what works for med spas, installed for {business.name}. Switch any of them off, or change the words and points. Atlas keeps the timing and logic up to date.</p>
            </div>
            {rows && rows.length > 0 && <div className="text-[12px] text-zinc-500"><b className="font-semibold text-[#14213d]">{onCount}</b> of {rows.length} on</div>}
          </div>

          {rows === null && <ListSkeleton />}
          {rows && rows.length === 0 && !error && (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
              <div className="text-[14px] font-semibold text-[#14213d]">The suite isn&apos;t installed for {business.name} yet</div>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-zinc-500">It installs automatically when a business uses the med spa layout. You can also install it now.</p>
              <Button size="sm" className="mt-4 bg-[#06318F] text-white hover:bg-[#0B5FD6]" disabled={installing} onClick={install}>{installing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Install the suite</Button>
            </div>
          )}

          {grouped.map((g) => (
            <section key={g.id} className="mt-7">
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: g.soft, color: g.color }}>{g.icon}</span>
                <h3 className="text-[14px] font-semibold text-[#14213d]">{g.label}</h3>
                <span className="text-[12.5px] text-zinc-500">{g.sub}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                {g.rows.map((j, i) => (
                  <JourneyRow key={j.key} j={j} first={i === 0} pending={pending.has(j.key)} onOpen={() => { setOpenKey(j.key); window.scrollTo({ top: 0 }); }} onToggle={(v) => toggle(j, v)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function JourneyRow({ j, first, pending, onOpen, onToggle }: { j: SuiteJourney; first: boolean; pending: boolean; onOpen: () => void; onToggle: (v: boolean) => void }) {
  return (
    <div className={cn("group grid cursor-pointer grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_176px_200px_44px_16px] items-center gap-5 px-5 py-3.5 transition-colors hover:bg-[#f7f9fc]", !first && "border-t border-zinc-100", !j.enabled && "bg-zinc-50/40")}
      onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-[14px] font-semibold", j.enabled ? "text-[#14213d]" : "text-zinc-500")}>{j.name}</span>
          {j.engine === "legacy" && <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500" title="Runs on the existing built-in automation; shown here so everything lives in one place">Built-in</span>}
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-zinc-500">{j.why}</p>
      </div>
      <div className="min-w-0 text-[12.5px]">
        <div className="truncate text-zinc-700">{j.trigger_text}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-zinc-500">
          <Clock3 className="h-3 w-3 shrink-0" /><span className="truncate">{j.timing_text}</span>
          <span className="ml-1 flex shrink-0 items-center gap-1 text-zinc-400">
            {j.channels.includes("push") && <Smartphone className="h-3.5 w-3.5" aria-label="Push" />}
            {j.channels.includes("email") && <Mail className="h-3.5 w-3.5" aria-label="Email" />}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        {j.reward_text ? <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#eaf1fc] px-2 py-0.5 text-[11.5px] font-medium text-[#0B5FD6]"><Gift className="h-3 w-3 shrink-0" /><span className="truncate">{j.reward_text}</span></span> : <span className="text-[12px] text-zinc-300">—</span>}
      </div>
      <div className="flex items-baseline text-[11px] text-zinc-500" title="Last 30 days">
        <Num v={j.entered_30d} l="entered" muted={!j.enabled} />
        <Num v={j.sent_30d} l="sent" muted={!j.enabled} />
        <Num v={j.converted_30d} l="converted" muted={!j.enabled} strong />
      </div>
      <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
        <Switch className="data-[state=checked]:bg-[#0B5FD6] data-[state=unchecked]:bg-zinc-300" checked={j.enabled} disabled={pending} onCheckedChange={onToggle} aria-label={`${j.name} ${j.enabled ? "on" : "off"}`} />
      </div>
      <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-zinc-500" />
    </div>
  );
}

function Num({ v, l, muted, strong }: { v: number; l: string; muted?: boolean; strong?: boolean }) {
  return (
    <span className="flex w-[56px] flex-col leading-tight">
      <span className={cn("text-[14px] font-semibold tabular-nums", muted ? "text-zinc-300" : strong && v > 0 ? "text-[#047857]" : "text-[#14213d]")}>{v.toLocaleString()}</span>
      <span>{l}</span>
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-7 space-y-6">
      {[3, 2].map((n, k) => (
        <div key={k}>
          <div className="mb-3 h-5 w-40 animate-pulse rounded bg-zinc-100" />
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {Array.from({ length: n }).map((_, i) => <div key={i} className={cn("flex items-center gap-6 px-5 py-4", i && "border-t border-zinc-100")}><div className="h-4 w-56 animate-pulse rounded bg-zinc-100" /><div className="h-4 w-64 animate-pulse rounded bg-zinc-100" /><div className="ml-auto h-5 w-9 animate-pulse rounded-full bg-zinc-100" /></div>)}
          </div>
        </div>
      ))}
    </div>
  );
}
