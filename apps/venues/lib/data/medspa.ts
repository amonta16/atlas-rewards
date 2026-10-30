/**
 * lib/data/medspa.ts — CP-185 · server lookups for the med spa patient app
 *
 * One call gives Home and /care everything: the parsed practice config, the
 * patient's logged treatments, and the (estimated) banked-credit balance.
 * Server components only. Cheap for non-med-spa businesses: callers only
 * invoke it when the layout is "medspa".
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types/database";
import { estimateCredits, nextDue, readMedspaConfig, type CreditEstimate, type MedspaConfig, type TreatmentLogRow } from "@/lib/medspa";

export type MedspaPatientContext = {
  cfg: MedspaConfig;
  log: TreatmentLogRow[];
  due: ReturnType<typeof nextDue>;
  credits: CreditEstimate | null;
  paid: boolean;
};

export const getMedspaPatientContext = cache(async (business: Business, userId: string | null): Promise<MedspaPatientContext> => {
  const cfg = readMedspaConfig(business.medspa_config);
  if (!userId) return { cfg, log: [], due: [], credits: null, paid: false };
  const supabase = createClient();
  const [{ data: logRows }, { data: bm }] = await Promise.all([
    supabase.from("medspa_treatment_log").select("*").eq("business_id", business.id).eq("user_id", userId).order("performed_at", { ascending: false }).limit(60),
    supabase.from("business_memberships").select("membership_payment_status,membership_paid_at").eq("business_id", business.id).eq("user_id", userId).maybeSingle(),
  ]);
  const log = (logRows ?? []) as TreatmentLogRow[];
  const status = (bm as { membership_payment_status?: string | null } | null)?.membership_payment_status ?? null;
  const paidAt = (bm as { membership_paid_at?: string | null } | null)?.membership_paid_at ?? null;
  return { cfg, log, due: nextDue(log), credits: estimateCredits(cfg.credits, paidAt, status, log), paid: status === "paid" };
});
