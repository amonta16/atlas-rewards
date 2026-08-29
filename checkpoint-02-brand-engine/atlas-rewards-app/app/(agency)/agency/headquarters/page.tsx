import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HeadquartersClient } from "@/components/agency/hq/headquarters-client";
import type {
  FounderMeeting, FieldSalesEvent, FounderActionItem, SalesActivityDay,
  AgencyAdminLite, PipelineOpportunity,
} from "@/lib/types/database";
import { pipelineTotals, todayInTz, DEFAULT_AGENCY_TZ } from "@/lib/founder-hq";

export const dynamic = "force-dynamic";

/**
 * CP-111: /agency/headquarters — the Founder Headquarters command center.
 *
 * Admin-only. The role check runs HERE on the server (and every row it
 * renders is additionally protected by RLS), so hiding the nav item is
 * cosmetic, not the security boundary. VAs and other roles are bounced
 * to the Apps deck.
 */
export default async function AgencyHeadquarters() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!adminRows || adminRows.length === 0) redirect("/agency");

  const activitySince = new Date(Date.now() - 84 * 86_400_000).toISOString().slice(0, 10);

  const [
    { data: meetings },
    { data: events },
    { data: items },
    { data: activity },
    { data: settings },
    { data: admins },
    { data: billing },
    { data: pipeline },
    { data: liveSubs },
  ] = await Promise.all([
    supabase.from("founder_meetings").select("*")
      .order("meeting_date", { ascending: true }).order("start_time", { ascending: true }),
    supabase.from("field_sales_events").select("*")
      .order("event_date", { ascending: true }).order("start_time", { ascending: true }),
    supabase.from("founder_action_items").select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("agency_sales_activity").select("*")
      .gte("activity_date", activitySince)
      .order("activity_date", { ascending: false }),
    supabase.from("agency_settings")
      .select("recordings_folder_url, agency_timezone").eq("id", 1).maybeSingle(),
    supabase.rpc("list_agency_admins"),
    supabase.rpc("agency_billing_summary"),
    supabase.from("agency_pipeline").select("*"),
    supabase.from("agency_billing_subscriptions")
      .select("business_id, status").in("status", ["active", "past_due"]),
  ]);

  // Keep today's revenue snapshot fresh (upserts today only — history is
  // never rewritten). Fire-and-forget: a failure must not block HQ.
  await supabase.rpc("record_agency_revenue_snapshot"); // errors surface in-page as missing snapshot, never a crash

  const tz = (settings?.agency_timezone as string) || DEFAULT_AGENCY_TZ;
  const todayIso = todayInTz(tz);

  const billingRow: any = Array.isArray(billing) ? billing[0] : billing;
  const liveMrrCents = Number(billingRow?.mrr_cents ?? 0);
  const liveBusinessIds = new Set<string>(
    ((liveSubs ?? []) as { business_id: string }[]).map(s => s.business_id));
  const totals = pipelineTotals(
    (pipeline ?? []) as PipelineOpportunity[], liveBusinessIds, todayIso);

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <HeadquartersClient
      friendlyName={friendlyName}
      todayIso={todayIso}
      admins={(admins ?? []) as AgencyAdminLite[]}
      recordingsUrl={(settings?.recordings_folder_url as string | null) ?? null}
      initialMeetings={(meetings ?? []) as FounderMeeting[]}
      initialEvents={(events ?? []) as FieldSalesEvent[]}
      initialItems={(items ?? []) as FounderActionItem[]}
      initialActivity={(activity ?? []) as SalesActivityDay[]}
      liveMrrCents={liveMrrCents}
      weightedPipelineCents={totals.weightedCents}
      followupsDue={totals.followupsDue}
    />
  );
}
