import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { rateLimit } from "@/lib/rate-limit";
import { reportHtml, reportSubject, reportText, type MonthlyReport } from "@/lib/reports/monthly";
import { sendReportEmail } from "@/lib/reports/send";

/**
 * POST /api/reports/test — CP-221 · "Email me a test" on Insights → Monthly reports.
 * Body: { businessId: string, month?: "YYYY-MM", to?: string }
 *
 * Signed-in managers / agency admins only (get_report_recipients enforces the
 * role). Sends the exact email the 1st-of-the-month cron sends, subject
 * prefixed "[Test]", to the caller's own login email by default — or to an
 * address already on this business's report list. Never stamps emailed_at,
 * so the real send on the 1st is unaffected. 5 tests / 10 min per user.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Recipients = { custom: string[] | null; effective: { email: string; name: string }[]; managers: string[]; me: string | null };

export async function POST(req: Request) {
  const sb = createServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const rl = await rateLimit(`report-test:${user.id}`, 5, 600);
  if (!rl.ok) return NextResponse.json({ error: "Too many test emails — try again in a few minutes." }, { status: 429 });

  let body: { businessId?: string; month?: string | null; to?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const businessId = String(body.businessId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return NextResponse.json({ error: "bad business" }, { status: 400 });

  // Role check + who's allowed to receive it.
  const { data: rec, error: recErr } = await sb.rpc("get_report_recipients", { p_business_id: businessId });
  if (recErr || !rec) return NextResponse.json({ error: recErr?.message ?? "not authorized" }, { status: 403 });
  const r = rec as Recipients;
  const me = (r.me ?? user.email ?? "").toLowerCase();
  const allowed = new Set([me, ...(r.custom ?? []), ...r.effective.map((x) => x.email), ...r.managers].map((e) => (e ?? "").toLowerCase()).filter(Boolean));
  const to = (body.to ?? "").trim().toLowerCase() || me;
  if (!to) return NextResponse.json({ error: "Your login has no email address." }, { status: 400 });
  if (!allowed.has(to)) return NextResponse.json({ error: "Add that address to the report list first, or send the test to yourself." }, { status: 400 });

  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, slug").eq("id", businessId).single();
  if (!biz) return NextResponse.json({ error: "business not found" }, { status: 404 });

  // Month: the one on screen. An archived month uses exactly what was stored;
  // otherwise the report is built fresh (month-to-date for the current month).
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(body.month ?? "") ? body.month! : thisMonth;
  let report: MonthlyReport | null = null;
  if (month !== thisMonth) {
    const { data: row } = await admin.from("business_monthly_reports").select("data").eq("business_id", businessId).eq("month", `${month}-01`).maybeSingle();
    report = (row?.data as MonthlyReport | undefined) ?? null;
  }
  if (!report) {
    const { data, error } = await admin.rpc("_build_monthly_report", { p_business_id: businessId, p_month: `${month}-01` });
    if (error || !data) return NextResponse.json({ error: error?.message ?? "couldn't build the report" }, { status: 500 });
    report = data as MonthlyReport;
  }

  const dashboardUrl = `${SITE_ORIGIN}/${biz.slug}/manage?tab=reports&month=${report.month}`;
  const firstName = (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] || undefined;
  const sent = await sendReportEmail([to], `[Test] ${reportSubject(report)}`, reportHtml(report, dashboardUrl, to === me ? firstName : undefined), reportText(report, dashboardUrl, to === me ? firstName : undefined));
  if (!sent.ok) return NextResponse.json({ error: sent.error ?? "send failed" }, { status: 502 });
  return NextResponse.json({ ok: true, to, month: report.month });
}
