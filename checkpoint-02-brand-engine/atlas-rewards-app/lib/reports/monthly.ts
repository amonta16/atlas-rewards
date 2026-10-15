/**
 * lib/reports/monthly.ts — CP-209 · monthly owner report (shared)
 *
 * One shape, two surfaces: the email the cron sends on the 1st
 * (app/api/reports/monthly) and the Reports tab on the manager dashboard
 * (components/manager/monthly-report.tsx). The numbers come from the
 * `_build_monthly_report` SQL function (cp209); this file only decides
 * which numbers to show for which niche, writes the plain-English
 * takeaways, and renders the email.
 *
 * Claims rule: every line here is computed from the report data. No
 * invented benchmarks, no "industry average" comparisons.
 */

export type ReportCore = {
  new_members: number; total_members: number; visits: number; active_members: number; returning_members: number;
  points_earned: number; points_redeemed: number; rewards_redeemed: number; reviews: number; referrals: number;
  membership_revenue_cents: number; paid_members: number; treatments: number;
  shop_sales_cents: number; shop_orders: number; inactive_60d: number;
};

export type MonthlyReport = {
  business: { id: string; name: string; slug: string; layout: string; brand_colors?: { primary?: string; secondary?: string } | null };
  month: string;          // "2026-09"
  partial: boolean;       // month-to-date
  through: string;
  current: ReportCore;
  previous: ReportCore;
  top_members: { name: string; points: number; visits: number }[];
  top_treatments: { name: string; n: number }[];
};

export type Kpi = { key: keyof ReportCore; label: string; money?: boolean; hint: string };

/** Headline numbers per niche. Med spas lead with visits + revenue; venues with members + visits. */
export function kpisFor(layout: string): Kpi[] {
  if (layout === "medspa") {
    return [
      { key: "treatments", label: "Treatments logged", hint: "Visits recorded at the front desk" },
      { key: "new_members", label: "New patients", hint: "Joined your app this month" },
      { key: "shop_sales_cents", label: "App sales", money: true, hint: "Packages, skincare and gift cards bought in the app" },
      { key: "membership_revenue_cents", label: "Membership revenue", money: true, hint: "Monthly plans collected" },
      { key: "returning_members", label: "Returning patients", hint: "Came back after an earlier visit" },
      { key: "reviews", label: "Reviews", hint: "Review requests submitted through the app" },
    ];
  }
  return [
    { key: "visits", label: "Visits", hint: "Member check-ins and purchases" },
    { key: "new_members", label: "New members", hint: "Joined your app this month" },
    { key: "active_members", label: "Active members", hint: "Visited at least once this month" },
    { key: "rewards_redeemed", label: "Rewards redeemed", hint: "Prizes and perks claimed" },
    { key: "returning_members", label: "Returning members", hint: "Came back after an earlier visit" },
    { key: "reviews", label: "Reviews", hint: "Review requests submitted through the app" },
  ];
}

export const monthName = (ym: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export const fmtMoney = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const fmtNum = (n: number) => n.toLocaleString("en-US");
export const fmtVal = (k: Kpi, v: number) => (k.money ? fmtMoney(v) : fmtNum(v));

/** { text: "+12%", dir: "up" } — null when there's nothing honest to compare against. */
export function delta(cur: number, prev: number): { text: string; dir: "up" | "down" | "flat" } | null {
  if (!prev && !cur) return null;
  if (!prev) return { text: "new", dir: "up" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "same", dir: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, dir: pct > 0 ? "up" : "down" };
}

/**
 * 2–4 plain-English takeaways, each with the action it points to.
 * Ordered by what an owner should do first.
 */
export function takeaways(r: MonthlyReport): { title: string; body: string; tone: "good" | "watch" | "do" }[] {
  const c = r.current, p = r.previous;
  const medspa = r.business.layout === "medspa";
  const who = medspa ? "patients" : "members";
  const out: { title: string; body: string; tone: "good" | "watch" | "do" }[] = [];

  const vNow = medspa ? c.treatments : c.visits;
  const vPrev = medspa ? p.treatments : p.visits;
  if (vNow > vPrev && vPrev > 0) {
    out.push({ tone: "good", title: `${medspa ? "Treatments" : "Visits"} up ${Math.round(((vNow - vPrev) / vPrev) * 100)}%`, body: `${fmtNum(vNow)} this month vs ${fmtNum(vPrev)} last month.` });
  } else if (vPrev > 0 && vNow < vPrev) {
    out.push({ tone: "watch", title: `${medspa ? "Treatments" : "Visits"} down ${Math.round(((vPrev - vNow) / vPrev) * 100)}%`, body: `${fmtNum(vNow)} vs ${fmtNum(vPrev)} last month. An automated offer or a win-back send is the fastest lever.` });
  }

  if (c.active_members > 0) {
    const rate = Math.round((c.returning_members / c.active_members) * 100);
    out.push({ tone: rate >= 40 ? "good" : "watch", title: `${rate}% of ${who} who came in were returning`, body: `${fmtNum(c.returning_members)} of ${fmtNum(c.active_members)} had been in before. ${rate >= 40 ? "Your regulars are sticking." : "Most visits were first-timers; the next job is getting them back."}` });
  }

  if (c.inactive_60d > 0) {
    out.push({ tone: "do", title: `${fmtNum(c.inactive_60d)} ${who} haven't been in for 60+ days`, body: `Send them a "we miss you" with a bonus from Insights → Inactive. It's the cheapest revenue you have.` });
  }

  if (c.new_members > 0 && c.reviews === 0) {
    out.push({ tone: "do", title: "No reviews came in this month", body: `${fmtNum(c.new_members)} new ${who} joined, but none left a review. Ask at checkout; the app gives them points for it.` });
  } else if (c.reviews > 0) {
    out.push({ tone: "good", title: `${fmtNum(c.reviews)} review${c.reviews === 1 ? "" : "s"} through the app`, body: "Every review lifts you in local search." });
  }

  return out.slice(0, 4);
}

/* ─────────────────────────── email ─────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

export function reportSubject(r: MonthlyReport): string {
  return `${r.business.name}: your ${monthName(r.month, { month: "long" })} report`;
}

/** Plain-text version (always sent alongside the HTML). */
export function reportText(r: MonthlyReport, dashboardUrl: string, firstName?: string): string {
  const k = kpisFor(r.business.layout);
  const lines = [
    `Hi${firstName ? ` ${firstName}` : ""},`, "",
    `Here's how ${r.business.name} did in ${monthName(r.month)}.`, "",
    ...k.map((x) => {
      const d = delta(r.current[x.key], r.previous[x.key]);
      return `${x.label}: ${fmtVal(x, r.current[x.key])}${d ? ` (${d.text} vs last month)` : ""}`;
    }),
    "",
    ...takeaways(r).flatMap((t) => [`• ${t.title}. ${t.body}`]),
    "",
    `Full report: ${dashboardUrl}`, "",
    "— Atlas Engine",
  ];
  return lines.join("\n");
}

/** Table-based HTML so it renders in Gmail, Outlook and Apple Mail. */
export function reportHtml(r: MonthlyReport, dashboardUrl: string, firstName?: string): string {
  const primary = r.business.brand_colors?.primary || "#18181b";
  const k = kpisFor(r.business.layout);
  const tk = takeaways(r);
  const tone = { good: "#047857", watch: "#b45309", do: primary };
  const label = { good: "Win", watch: "Watch", do: "Do next" };
  const cells = k.map((x) => {
    const d = delta(r.current[x.key], r.previous[x.key]);
    const color = !d ? "#71717a" : d.dir === "up" ? "#047857" : d.dir === "down" ? "#b91c1c" : "#71717a";
    return `<td width="50%" style="padding:6px;vertical-align:top">
      <div style="border:1px solid #e4e4e7;border-radius:14px;padding:14px 16px;background:#ffffff">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa">${esc(x.label)}</div>
        <div style="font-size:26px;font-weight:800;color:#18181b;margin-top:4px">${esc(fmtVal(x, r.current[x.key]))}</div>
        <div style="font-size:12px;color:${color};margin-top:2px">${d ? `${esc(d.text)} vs last month` : "&nbsp;"}</div>
      </div></td>`;
  });
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`);

  const top = r.business.layout === "medspa" && r.top_treatments.length
    ? { title: "Most-booked treatments", items: r.top_treatments.map((t) => [t.name, `${t.n}×`]) }
    : r.top_members.length
      ? { title: `Top ${r.business.layout === "medspa" ? "patients" : "members"} this month`, items: r.top_members.map((m) => [m.name, `${fmtNum(m.points)} pts`]) }
      : null;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reportSubject(r))}</title></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="background:${primary};border-radius:18px 18px 0 0;padding:28px 28px 24px;color:#ffffff">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Monthly report</div>
    <div style="font-size:26px;font-weight:800;margin-top:6px">${esc(r.business.name)}</div>
    <div style="font-size:15px;opacity:.9;margin-top:2px">${esc(monthName(r.month))}</div>
  </td></tr>
  <tr><td style="background:#fafafa;padding:22px 22px 8px">
    <div style="font-size:15px;color:#3f3f46;padding:0 6px 10px">Hi${firstName ? ` ${esc(firstName)}` : ""}, here's how last month went in your app.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>
  </td></tr>
  ${tk.length ? `<tr><td style="background:#fafafa;padding:8px 28px 6px">
    <div style="font-size:15px;font-weight:800;color:#18181b;margin:8px 0 10px">What it means</div>
    ${tk.map((t) => `<div style="border-left:3px solid ${tone[t.tone]};background:#ffffff;border-radius:0 10px 10px 0;padding:10px 14px;margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${tone[t.tone]}">${label[t.tone]}</div>
      <div style="font-size:14px;font-weight:700;color:#18181b;margin-top:2px">${esc(t.title)}</div>
      <div style="font-size:13px;color:#52525b;margin-top:2px;line-height:1.45">${esc(t.body)}</div></div>`).join("")}
  </td></tr>` : ""}
  ${top ? `<tr><td style="background:#fafafa;padding:8px 28px 6px">
    <div style="font-size:15px;font-weight:800;color:#18181b;margin:8px 0 8px">${esc(top.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">
      ${top.items.map(([a, b], i) => `<tr><td style="padding:10px 14px;font-size:14px;color:#18181b;${i ? "border-top:1px solid #f4f4f5;" : ""}">${esc(a)}</td><td align="right" style="padding:10px 14px;font-size:13px;color:#71717a;${i ? "border-top:1px solid #f4f4f5;" : ""}">${esc(b)}</td></tr>`).join("")}
    </table></td></tr>` : ""}
  <tr><td style="background:#fafafa;padding:22px 28px 28px;border-radius:0 0 18px 18px" align="center">
    <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">See the full report</a>
    <div style="font-size:12px;color:#a1a1aa;margin-top:16px">Sent by Atlas Engine on the 1st of every month to ${esc(r.business.name)}'s managers.</div>
  </td></tr>
</table></td></tr></table></body></html>`;
}
