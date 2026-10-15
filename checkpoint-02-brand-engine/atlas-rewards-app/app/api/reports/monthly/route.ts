import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { reportHtml, reportSubject, reportText, type MonthlyReport } from "@/lib/reports/monthly";

/**
 * GET /api/reports/monthly — CP-209 · Vercel Cron, 1st of the month at 16:00 UTC (9am PT).
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel adds it to cron calls).
 *
 * For every business (demo businesses skipped):
 *   1. Builds LAST month's report with `_build_monthly_report` (service role only)
 *      and upserts it into business_monthly_reports (the dashboard's archive).
 *   2. Emails it to the business's managers via Resend, once. emailed_at is
 *      stamped BEFORE sending, so a retry never double-sends.
 *
 * Manual runs (same auth), all optional:
 *   ?month=2026-09   a specific month (default: last month)
 *   ?business=<id>   one business only
 *   ?dry=1           build + store, send nothing; returns the subject + recipients
 *   ?force=1         resend even if already emailed
 *   ?to=<email>      send ONLY to this address (test a real email; doesn't stamp emailed_at)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FROM = process.env.REPORTS_FROM_EMAIL ?? process.env.LANDING_FROM_EMAIL ?? "Atlas Engine <hello@atlas-engine.app>";

function lastMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function send(to: string[], subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.info(`[reports] RESEND_API_KEY not set — would have emailed ${to.join(", ")}: ${subject}`); return false; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!r.ok) console.error("[reports] resend failed", r.status, await r.text().catch(() => ""));
  return r.ok;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "") ? url.searchParams.get("month")! : lastMonth();
  const only = url.searchParams.get("business");
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const testTo = url.searchParams.get("to");
  const db = createAdminClient();
  const started = Date.now();

  let q = db.from("businesses").select("id, slug, name, is_demo").eq("status", "active").order("created_at");
  if (only) q = q.eq("id", only);
  const { data: businesses, error } = await q;
  if (error) { console.error("[reports] list failed", error); return NextResponse.json({ error: "query failed" }, { status: 500 }); }

  const results: Record<string, unknown>[] = [];
  for (const b of businesses ?? []) {
    if (b.is_demo && !only) continue;
    if (Date.now() - started > 270_000) { results.push({ slug: b.slug, skipped: "time budget" }); continue; }

    const { data: report, error: rErr } = await db.rpc("_build_monthly_report", { p_business_id: b.id, p_month: `${month}-01` });
    if (rErr || !report) { results.push({ slug: b.slug, error: rErr?.message ?? "no report" }); continue; }
    const r = report as MonthlyReport;

    const { data: row } = await db.from("business_monthly_reports")
      .upsert({ business_id: b.id, month: `${month}-01`, data: r, generated_at: new Date().toISOString() }, { onConflict: "business_id,month" })
      .select("id, emailed_at").single();

    const { data: rec } = await db.rpc("_report_recipients", { p_business_id: b.id });
    const recipients = ((rec ?? []) as { email: string; name: string }[]).filter((x) => x.email);
    const to = testTo ? [testTo] : recipients.map((x) => x.email);
    const firstName = !testTo && recipients.length === 1 ? recipients[0].name.split(" ")[0] || undefined : undefined;
    const dashboardUrl = `${SITE_ORIGIN}/${b.slug}/manage?tab=reports&month=${month}`;
    const subject = reportSubject(r);

    if (dry) { results.push({ slug: b.slug, subject, to, stored: !!row }); continue; }
    if (!to.length) { results.push({ slug: b.slug, skipped: "no manager emails" }); continue; }
    if (row?.emailed_at && !force && !testTo) { results.push({ slug: b.slug, skipped: "already emailed" }); continue; }

    // Stamp first so a crash or retry never double-sends (test sends don't stamp).
    if (!testTo && row) await db.from("business_monthly_reports").update({ emailed_at: new Date().toISOString(), emailed_to: to }).eq("id", row.id);
    const ok = await send(to, subject, reportHtml(r, dashboardUrl, firstName), reportText(r, dashboardUrl, firstName));
    if (!ok && !testTo && row) await db.from("business_monthly_reports").update({ emailed_at: null }).eq("id", row.id);
    results.push({ slug: b.slug, sent: ok, to: to.length });
  }

  return NextResponse.json({ month, count: results.length, results });
}
