import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { previewDb } from "@/lib/preview/store";
import { DEFAULT_STEPS, type EmailStep } from "@/lib/landing/lead-nurture";
import { loadSteps } from "@/lib/landing/lead-nurture-send";
import { LeadFunnel, type FunnelData, type FunnelTab, type OptinRow } from "@/components/agency/lead-funnel";
import type { CallTask, FollowData, FollowLead, LogCell } from "@/components/agency/lead-sequence";
import { DEFAULT_SEQUENCE, fill, valuesFor, type SeqStep } from "@/lib/landing/lead-sequence";
import { loadSequence } from "@/lib/landing/lead-sequence-run";
import { previewUrl } from "@/lib/preview/store";
import { smsSendEnabled } from "@/lib/preview/twilio-sms";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";

/**
 * /agency/lead-funnel — CP-238 · the lead magnet (atlas-engine.app/medspa/app), end to end.
 *   Overview         visits → previews built → opt-ins → walkthroughs booked → showed → paid,
 *                    per day, per campaign, and the latest opt-ins.
 *   Follow-up emails the 3-step sequence: timing, copy, preview, on/off (until CP-243).
 *   Sequence         audit step 6: texts, emails and call tasks on one clock, each editable.
 *   Follow-through   every lead's steps (sent / skipped and why / cancelled) and the calls to make.
 * Cohort view: every number after "visits" follows the owners who opted in inside the range.
 * agency_admin only (checked here; the sidebar flag is cosmetic).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DAY = 86_400_000;
const RANGES = [7, 30, 90] as const;
const BOOKED = ["booked", "showed", "no_show", "paid"];

async function load(days: number): Promise<FunnelData> {
  const db = previewDb();
  const since = new Date(Date.now() - days * DAY).toISOString();
  const notes: string[] = [];

  const visitsQ = await db.from("funnel_visits").select("visitor_id, created_at, utm_campaign").eq("path", "/medspa/app").gte("created_at", since).limit(50000);
  if (visitsQ.error) notes.push("Visits aren't being counted yet: apply the CP-238 SQL (funnel_visits).");
  const visits = (visitsQ.data ?? []) as { visitor_id: string; created_at: string; utm_campaign: string | null }[];

  const builtQ = await db.from("app_previews").select("id", { count: "exact", head: true }).eq("source", "auto").gte("created_at", since);

  const cols = "id, slug, business_name, contact_name, contact_email, contact_at, utm_campaign, landing_lead_id, claimed_at, expires_at";
  const optins$ = (sel: string) => db.from("app_previews").select(sel).not("contact_at", "is", null).gte("contact_at", since).order("contact_at", { ascending: false }).limit(2000);
  let optQ = await optins$(`${cols}, nurture_step, nurture_stopped_at, nurture_unsubscribed_at`);
  if (optQ.error) {
    optQ = await optins$(cols);
    if (!notes.length) notes.push("Email progress isn't tracked yet: apply the CP-238 SQL.");
  }
  const optRows = (optQ.data ?? []) as unknown as Array<Record<string, unknown>>;

  const leadIds = optRows.map((r) => r.landing_lead_id).filter(Boolean) as string[];
  const leads = new Map<string, { demo_request_id: string | null; status: string }>();
  for (let i = 0; i < leadIds.length; i += 300) {
    const { data } = await db.from("landing_leads").select("id, demo_request_id, status").in("id", leadIds.slice(i, i + 300));
    for (const l of (data ?? []) as { id: string; demo_request_id: string | null; status: string }[]) leads.set(l.id, l);
  }

  const optins: OptinRow[] = optRows.map((r) => {
    const l = r.landing_lead_id ? leads.get(String(r.landing_lead_id)) : undefined;
    // Audit step 6: claimed_at is set by "Text me my app", so it isn't a payment.
    const paid = l?.status === "paid";
    const showed = paid || l?.status === "showed";
    const booked = showed || !!l?.demo_request_id || BOOKED.includes(String(l?.status ?? ""));
    return {
      id: String(r.id), slug: String(r.slug), spa: String(r.business_name), name: (r.contact_name as string | null) ?? null, email: (r.contact_email as string | null) ?? null,
      at: String(r.contact_at), campaign: (r.utm_campaign as string | null) ?? null,
      stage: paid ? "paid" : showed ? "showed" : booked ? "booked" : l?.status === "lost" ? "lost" : "opted_in",
      emails: typeof r.nurture_step === "number" ? r.nurture_step : null,
      emailsStopped: r.nurture_unsubscribed_at ? "unsubscribed" : r.nurture_stopped_at ? "stopped" : null,
    };
  });

  // per day (oldest → newest), in Pacific time
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const daily = new Map<string, { visitors: Set<string>; optins: number }>();
  for (let i = days - 1; i >= 0; i--) daily.set(dayKey(new Date(Date.now() - i * DAY).toISOString()), { visitors: new Set(), optins: 0 });
  for (const v of visits) daily.get(dayKey(v.created_at))?.visitors.add(v.visitor_id);
  for (const o of optins) { const d = daily.get(dayKey(o.at)); if (d) d.optins++; }

  // per campaign
  const camp = new Map<string, { visitors: Set<string>; optins: number; booked: number; paid: number }>();
  const c = (k: string | null) => { const key = k || "(none)"; if (!camp.has(key)) camp.set(key, { visitors: new Set(), optins: 0, booked: 0, paid: 0 }); return camp.get(key)!; };
  for (const v of visits) c(v.utm_campaign).visitors.add(v.visitor_id);
  for (const o of optins) { const x = c(o.campaign); x.optins++; if (o.stage !== "opted_in" && o.stage !== "lost") x.booked++; if (o.stage === "paid") x.paid++; }

  return {
    days,
    visitors: visitsQ.error ? null : new Set(visits.map((v) => v.visitor_id)).size,
    visits: visitsQ.error ? null : visits.length,
    built: builtQ.count ?? null,
    optins: optins.length,
    booked: optins.filter((o) => ["booked", "showed", "paid"].includes(o.stage)).length,
    showed: optins.filter((o) => ["showed", "paid"].includes(o.stage)).length,
    paid: optins.filter((o) => o.stage === "paid").length,
    daily: Array.from(daily, ([day, d]) => ({ day, visitors: d.visitors.size, optins: d.optins })),
    campaigns: Array.from(camp, ([name, x]) => ({ name, visitors: x.visitors.size, optins: x.optins, booked: x.booked, paid: x.paid })).sort((a, b) => b.optins - a.optins || b.visitors - a.visitors).slice(0, 12),
    recent: optins.slice(0, 25),
    notes,
  };
}

/** Audit step 6: every lead's follow-through and the open call tasks. null until CP-243 is applied. */
async function loadFollow(steps: SeqStep[]): Promise<FollowData | null> {
  const db = previewDb();
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { data: rows, error } = await db.from("app_previews")
    .select("id, slug, business_name, phone, contact_name, contact_email, contact_phone, contact_marketing_consent_at, contact_at, expires_at, seq_step, sms_stopped_at, seq_stopped_reason, nurture_stopped_at, nurture_unsubscribed_at, treatments, treatments_are_examples")
    .not("contact_at", "is", null).gte("contact_at", since).order("contact_at", { ascending: false }).limit(200);
  if (error) return null;
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const ids = list.map((r) => String(r.id));
  const logs = new Map<string, Record<number, LogCell>>();
  const open: Array<{ id: string; preview_id: string; step: number; due_at: string }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("lead_sequence_log").select("id, preview_id, step, status, reason, outcome, at, due_at").in("preview_id", ids.slice(i, i + 200));
    for (const l of (data ?? []) as Array<{ id: string; preview_id: string; step: number; status: LogCell["status"]; reason: string | null; outcome: LogCell["outcome"]; at: string; due_at: string }>) {
      if (!logs.has(l.preview_id)) logs.set(l.preview_id, {});
      logs.get(l.preview_id)![l.step] = { status: l.status, reason: l.reason, outcome: l.outcome, at: l.at, dueAt: l.due_at };
      if (l.status === "task_open") open.push(l);
    }
  }
  const byId = new Map(list.map((r) => [String(r.id), r]));
  const leads: FollowLead[] = list.map((r) => ({
    id: String(r.id), slug: String(r.slug), spa: String(r.business_name), email: (r.contact_email as string | null) ?? null, optedAt: String(r.contact_at),
    nextStep: Number(r.seq_step ?? 0),
    stopped: r.nurture_stopped_at ? String(r.seq_stopped_reason ?? "stopped") : null,
    smsStopped: !!r.sms_stopped_at, smsOk: !!r.contact_phone && !!r.contact_marketing_consent_at, unsubscribed: !!r.nurture_unsubscribed_at,
    log: logs.get(String(r.id)) ?? {},
  }));
  const tasks: CallTask[] = open.sort((a, b) => a.due_at.localeCompare(b.due_at)).flatMap((t) => {
    const r = byId.get(t.preview_id);
    const st = steps.find((s) => s.step === t.step);
    if (!r || !st) return [];
    const v = valuesFor(r as unknown as Parameters<typeof valuesFor>[0], { app: previewUrl(String(r.slug)), desk: "", walkthrough: `${SITE_ORIGIN}/medspa/walkthrough/${r.slug}` });
    return [{
      logId: t.id, previewId: t.preview_id, spa: String(r.business_name), step: t.step, name: st.name,
      phone: (r.contact_phone as string | null) ?? (r.phone as string | null) ?? null,
      whose: r.contact_phone ? "Owner's mobile" : "Business line (Google)", dueAt: t.due_at, script: fill(st.body, v), appUrl: previewUrl(String(r.slug)),
    }];
  });
  return { leads, tasks, now: Date.now() };
}

export default async function LeadFunnelPage({ searchParams }: { searchParams: { d?: string; tab?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) redirect("/agency");

  const days = RANGES.find((r) => String(r) === searchParams.d) ?? 30;
  const [data, saved, seqSaved] = await Promise.all([load(days), loadSteps().catch(() => null), loadSequence().catch(() => null)]);
  const steps: EmailStep[] = saved?.length ? saved : DEFAULT_STEPS;
  // Audit step 6: the multi-channel sequence (CP-243). The editor shows the starting schedule until then.
  const seqSteps: SeqStep[] = seqSaved?.length ? seqSaved : DEFAULT_SEQUENCE;
  const follow = seqSaved ? await loadFollow(seqSteps) : null;
  const seqReached: Record<number, number> = {};
  for (const l of follow?.leads ?? []) for (const [k, c] of Object.entries(l.log)) if (c.status === "sent" || c.status === "task_done" || c.status === "task_open" || c.status === "would_send") seqReached[Number(k)] = (seqReached[Number(k)] ?? 0) + 1;

  // How many owners reached each step (all time, last 30 days of opt-ins is plenty).
  const reached: Record<number, number> = {};
  const r = await previewDb().from("app_previews").select("nurture_step").gt("nurture_step", 0).gte("contact_at", new Date(Date.now() - 90 * DAY).toISOString()).limit(5000);
  for (const row of (r.data ?? []) as { nurture_step: number }[]) for (let s = 1; s <= row.nurture_step; s++) reached[s] = (reached[s] ?? 0) + 1;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lead funnel</h1>
      <p className="mt-1 text-sm text-slate-600">
        The free app preview at atlas-engine.app/medspa/app: who visits, who opts in, who books a walkthrough and who pays, plus the follow-up emails every opt-in gets.
      </p>
      <LeadFunnel
        data={data}
        steps={steps}
        stepsSaved={!!saved?.length}
        reached={reached}
        sending={process.env.LEAD_NURTURE_SEND === "1"}
        hasPostal={!!process.env.MAIL_POSTAL_ADDRESS}
        initialTab={(["emails", "sequence", "follow"] as FunnelTab[]).find((t) => t === searchParams.tab) ?? "overview"}
        sequence={{ steps: seqSteps, saved: !!seqSaved, emailLive: process.env.LEAD_NURTURE_SEND === "1", smsLive: smsSendEnabled(), hasPostal: !!process.env.MAIL_POSTAL_ADDRESS, reached: seqReached }}
        follow={follow}
      />
    </div>
  );
}
