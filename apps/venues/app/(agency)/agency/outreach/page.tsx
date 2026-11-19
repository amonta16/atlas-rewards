import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db, loadSettings, loadSteps, sentSince } from "@/lib/outreach/engine";
import { setupStatus } from "@/lib/outreach/config";
import { startOfPacificDay } from "@/lib/outreach/time";
import { OutreachApp, type OutreachData } from "@/components/agency/outreach/outreach-app";
import type { Campaign, Lead, Message, Reply } from "@/lib/outreach/shared";

/**
 * /agency/outreach — CP-250 · Atlas's own cold email to med spas.
 *   Overview   pipeline counts, sends today vs cap, replies, setup checklist, last engine run
 *   Find       Google Places search by area, CSV import, manual add
 *   Review     AI-drafted email 1 (and follow-ups, if set) waiting for approve / edit / skip
 *   Leads      every spa with status; drawer with its emails, replies and actions
 *   Inbox      replies, bounces and auto-replies read from the outreach mailbox
 *   Sequence   the 3 steps · Settings: cap, window, days, approval, pause, do-not-contact
 * agency_admin only (checked here; the sidebar flag is cosmetic).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DAY = 86_400_000;

export default async function OutreachPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) redirect("/agency");

  const d = db();
  const probe = await d.from("outreach_settings").select("id").limit(1);
  const sqlMissing = !!probe.error;

  const now = Date.now();
  const [settings, steps, leadsQ, campsQ, repliesQ, suppQ] = await Promise.all([
    loadSettings(),
    sqlMissing ? Promise.resolve([]) : loadSteps(),
    d.from("outreach_leads").select("*").order("created_at", { ascending: false }).limit(1000),
    d.from("outreach_campaigns").select("*").order("created_at", { ascending: false }),
    d.from("outreach_replies").select("*").order("received_at", { ascending: false }).limit(300),
    d.from("outreach_suppressions").select("value, reason, created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const leads = (leadsQ.data ?? []) as Lead[];
  const ids = leads.map((l) => l.id);
  const messages: Message[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await d.from("outreach_messages").select("*").in("lead_id", ids.slice(i, i + 200));
    messages.push(...((data ?? []) as Message[]));
  }

  const week = new Date(now - 7 * DAY).toISOString();
  const [today, sent7] = sqlMissing ? [0, 0] : await Promise.all([sentSince(startOfPacificDay(now)), sentSince(week)]);
  const replies = (repliesQ.data ?? []) as Reply[];

  const data: OutreachData = {
    sqlMissing,
    setup: setupStatus(),
    settings,
    steps,
    campaigns: (campsQ.data ?? []) as Campaign[],
    leads,
    messages,
    replies,
    suppressions: (suppQ.data ?? []) as OutreachData["suppressions"],
    stats: {
      sentToday: today,
      sent7,
      sentAll: messages.filter((m) => m.status === "sent").length,
      replies7: replies.filter((r) => r.kind === "reply" && r.lead_id && r.received_at >= week).length,
      bounces7: replies.filter((r) => r.kind === "bounce" && r.lead_id && r.received_at >= week).length,
    },
  };
  return <OutreachApp data={data} />;
}
