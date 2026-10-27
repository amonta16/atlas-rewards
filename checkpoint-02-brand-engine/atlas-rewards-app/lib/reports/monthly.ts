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
  business: {
    id: string; name: string; slug: string; layout: string;
    brand_colors?: { primary?: string; secondary?: string } | null;
    /** CP-209b: the business's own logo + square app icon (email header, dashboard band). */
    logo_url?: string | null; icon_url?: string | null;
    /** CP-210: the app's hero photo — the report's header image. */
    hero_url?: string | null;
  };
  month: string;          // "2026-09"
  partial: boolean;       // month-to-date
  through: string;
  current: ReportCore;
  previous: ReportCore;
  top_members: { name: string; points: number; visits: number }[];
  top_treatments: { name: string; n: number }[];
  /** CP-221: free weekly home spin (entertainment apps). Absent on older archived months. */
  weekly_spin?: { enabled: boolean; current: WeeklySpinStats; previous: WeeklySpinStats } | null;
};

/** CP-221: the weekly home spin's month, from _weekly_spin_stats. */
export type WeeklySpinStats = {
  spins: number; spinners: number; checkin_spins: number; prizes_won: number; points_won: number;
  visited_after: number; notified: number; members_reached: number; spun_after_push: number;
};

/**
 * CP-221: the "Weekly home spin" block for the report, or null when the
 * business doesn't use it (off and no spins this month or last).
 */
export function weeklySpinBlock(r: MonthlyReport): null | {
  rows: { label: string; value: string; change: { text: string; dir: "up" | "down" | "flat" } | null; hint: string }[];
  line: string;
} {
  const ws = r.weekly_spin;
  if (!ws || !ws.current) return null;
  const c = ws.current, p = ws.previous ?? ({} as WeeklySpinStats);
  if (!ws.enabled && !c.spins && !(p.spins ?? 0)) return null;
  const rate = c.spins ? Math.round((c.visited_after / c.spins) * 100) : 0;
  const rows = [
    { label: "Home spins", value: fmtNum(c.spins), change: changeText(c.spins, p.spins ?? 0, r.month), hint: "Free weekly spins taken from home" },
    { label: "Members who spun", value: fmtNum(c.spinners), change: changeText(c.spinners, p.spinners ?? 0, r.month), hint: "Different people" },
    { label: "Came in within 7 days", value: fmtNum(c.visited_after), change: changeText(c.visited_after, p.visited_after ?? 0, r.month), hint: "Home spins followed by a check-in within a week" },
    { label: "Spin pushes sent", value: fmtNum(c.notified), change: null, hint: `${fmtNum(c.members_reached)} members reached` },
    { label: "Prizes won from home", value: fmtNum(c.prizes_won), change: null, hint: `${fmtNum(c.points_won)} points won` },
  ];
  const line = c.spins
    ? `${fmtNum(c.spinners)} member${c.spinners === 1 ? "" : "s"} took ${fmtNum(c.spins)} free home spin${c.spins === 1 ? "" : "s"}; ${fmtNum(c.visited_after)} (${rate}%) were followed by a visit within a week.`
    : ws.enabled ? "No one took their free weekly spin yet this month." : "The weekly home spin is switched off.";
  return { rows, line };
}

/* ─────────────────────────── branding ─────────────────────────── */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance([r, g, b]: [number, number, number]) {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function darken([r, g, b]: [number, number, number], k: number) {
  const h = (n: number) => Math.round(n * k).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * The business's colors, made safe to use: `primary` for big color areas,
 * `onPrimary` for text on it (dark text on a pale brand, white otherwise),
 * `accent` = the brand color darkened until it reads as text on white.
 */
export function brandOf(colors?: { primary?: string; secondary?: string } | null) {
  // Normalized to #rrggbb so callers can append an alpha suffix ("…e6").
  const rgb = hexToRgb(colors?.primary ?? "") ?? [24, 24, 27];
  const primary = darken(rgb, 1);
  const L = luminance(rgb);
  const onPrimary = L > 0.45 ? "#18181b" : "#ffffff";
  let k = 1, accent = primary;
  while (luminance(hexToRgb(accent)!) > 0.18 && k > 0.3) { k -= 0.08; accent = darken(rgb, k); }
  const secondary = hexToRgb(colors?.secondary ?? "") ? colors!.secondary! : null;
  return { primary, onPrimary, accent, secondary };
}

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
    { key: "returning_members", label: "Returning members", hint: "Visited on two or more different days" },
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

/** "August" — the month before r.month. */
export function prevMonthName(ym: string): string {
  const d = new Date(`${ym}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

/** "up 17% on August" / "down 8% on August" / "level with August" / null. */
export function changeText(cur: number, prev: number, ym: string): { text: string; dir: "up" | "down" | "flat" } | null {
  const d = delta(cur, prev);
  if (!d) return null;
  const m = prevMonthName(ym);
  if (d.text === "new") return { text: `none in ${m}`, dir: "up" };
  if (d.dir === "flat") return { text: `level with ${m}`, dir: "flat" };
  return { text: `${d.dir === "up" ? "up" : "down"} ${d.text.replace(/^[+-]/, "")} on ${m}`, dir: d.dir };
}

/**
 * The month in two sentences, the way a person would write it. Built only
 * from the numbers in the report.
 */
export function summary(r: MonthlyReport): string {
  const c = r.current, p = r.previous;
  const medspa = r.business.layout === "medspa";
  const lead = r.partial ? `So far this month, ` : "";
  const ch = (a: number, b: number) => {
    const d = changeText(a, b, r.month);
    return d && d.dir !== "flat" && !d.text.startsWith("none") ? `, ${d.text}` : "";
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const parts: string[] = [];
  if (medspa) {
    parts.push(cap(`${lead}${r.business.name} logged ${fmtNum(c.treatments)} treatment${c.treatments === 1 ? "" : "s"}${ch(c.treatments, p.treatments)}.`));
    const money: string[] = [];
    if (c.shop_sales_cents) money.push(`${fmtMoney(c.shop_sales_cents)} in app sales`);
    if (c.membership_revenue_cents) money.push(`${fmtMoney(c.membership_revenue_cents)} in memberships`);
    parts.push(`${fmtNum(c.new_members)} new patient${c.new_members === 1 ? "" : "s"} joined the app${money.length ? `, and it brought in ${money.join(" plus ")}` : ""}.`);
  } else {
    parts.push(cap(`${lead}${r.business.name} had ${fmtNum(c.visits)} member visit${c.visits === 1 ? "" : "s"}${ch(c.visits, p.visits)}.`));
    parts.push(`${fmtNum(c.new_members)} new member${c.new_members === 1 ? "" : "s"} joined and ${fmtNum(c.rewards_redeemed)} reward${c.rewards_redeemed === 1 ? " was" : "s were"} redeemed.`);
  }
  return parts.join(" ");
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
  // CP-210: a rise is already in the written summary; only a drop earns a list item.
  if (vPrev > 0 && vNow < vPrev) {
    out.push({ tone: "watch", title: `${medspa ? "Treatments" : "Visits"} down ${Math.round(((vPrev - vNow) / vPrev) * 100)}%`, body: `${fmtNum(vNow)} vs ${fmtNum(vPrev)} last month. An automated offer or a win-back send is the fastest lever.` });
  }

  if (c.active_members > 0) {
    const rate = Math.round((c.returning_members / c.active_members) * 100);
    // CP-222: "returning" = visited on 2+ different days (not only "before this month").
    out.push({ tone: rate >= 40 ? "good" : "watch", title: `${rate}% of ${who} who came in came back`, body: `${fmtNum(c.returning_members)} of ${fmtNum(c.active_members)} have visited on two or more different days. ${rate >= 40 ? "Your regulars are sticking." : "Most were one-time visits so far; the next job is getting them back."}` });
  }

  if (c.inactive_60d > 0) {
    out.push({ tone: "do", title: `${fmtNum(c.inactive_60d)} ${who} haven't been in for 60+ days`, body: `Send them a "we miss you" with a bonus from Insights → Inactive. It's the cheapest revenue you have.` });
  }

  // CP-221: weekly home spin — only when it ran this month.
  const ws = r.weekly_spin;
  if (!medspa && ws?.enabled && ws.current) {
    const w = ws.current;
    if (w.spins > 0) {
      const rate = Math.round((w.visited_after / w.spins) * 100);
      out.push({ tone: rate >= 25 ? "good" : "watch", title: `${rate}% of home spins turned into a visit`,
        body: `${fmtNum(w.visited_after)} of ${fmtNum(w.spins)} free weekly spins were followed by a check-in within 7 days. ${rate >= 25 ? "Prizes they win at home are pulling them in." : "Try a prize that's only good in person (a free game or token) to give them a reason to come in."}` });
    } else if (w.notified > 0) {
      out.push({ tone: "watch", title: "Nobody took their free weekly spin", body: `${fmtNum(w.notified)} spin reminders went out. Mention it at the desk so members know it's there.` });
    }
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
    summary(r), "",
    ...k.map((x) => {
      const d = changeText(r.current[x.key], r.previous[x.key], r.month);
      return `${x.label}: ${fmtVal(x, r.current[x.key])}${d ? ` (${d.text})` : ""}`;
    }),
    ...(() => {
      const ws = weeklySpinBlock(r);
      return ws ? ["", "Weekly home spin:", ws.line, ...ws.rows.map((x) => `${x.label}: ${x.value}${x.change ? ` (${x.change.text})` : ""}`)] : [];
    })(),
    "",
    "Worth your attention:",
    ...takeaways(r).map((t, i) => `${i + 1}. ${t.title}. ${t.body}`),
    "",
    `Full report: ${dashboardUrl}`, "",
    `${r.business.name} · Powered by Atlas Engine`,
  ];
  return lines.join("\n");
}

const abs = (u: string | null | undefined, base: string) => {
  if (!u) return null;
  if (!u.startsWith("/")) return u;
  try { return new URL(u, base).toString(); } catch { return null; }
};

/**
 * Table-based HTML so it renders in Gmail, Outlook and Apple Mail.
 * CP-210 design: the app's hero photo on top, a brand-color band with the
 * logo and the month, a written summary, a plain figures table, a numbered
 * "worth your attention" list and simple bar rows. No badges or tags.
 */
export function reportHtml(r: MonthlyReport, dashboardUrl: string, firstName?: string): string {
  const { primary, onPrimary, accent, secondary } = brandOf(r.business.brand_colors);
  const logo = abs(r.business.logo_url || r.business.icon_url, dashboardUrl);
  const hero = abs(r.business.hero_url, dashboardUrl);
  const k = kpisFor(r.business.layout);
  const tk = takeaways(r);
  const ws = weeklySpinBlock(r);
  const medspa = r.business.layout === "medspa";
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";

  const cell = (x: Kpi, i: number) => {
    const d = changeText(r.current[x.key], r.previous[x.key], r.month);
    const color = !d ? "#a1a1aa" : d.dir === "up" ? "#15803d" : d.dir === "down" ? "#b91c1c" : "#71717a";
    const left = i % 3 === 0 ? "" : "border-left:1px solid #ececec;";
    const top = i >= 3 ? "border-top:1px solid #ececec;" : "";
    return `<td width="33%" style="${left}${top}padding:16px 16px 14px;vertical-align:top">
      <div style="font-size:12px;color:#71717a">${esc(x.label)}</div>
      <div style="font-size:24px;font-weight:700;color:#18181b;margin-top:4px;letter-spacing:-.01em">${esc(fmtVal(x, r.current[x.key]))}</div>
      <div style="font-size:12px;color:${color};margin-top:3px">${d ? esc(d.text) : "&nbsp;"}</div></td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < k.length; i += 3) rows.push(`<tr>${k.slice(i, i + 3).map((x, j) => cell(x, i + j)).join("")}</tr>`);

  const bars = medspa && r.top_treatments.length
    ? { title: "Most-booked treatments", items: r.top_treatments.map((t) => ({ a: t.name, b: `${t.n}`, v: t.n })) }
    : r.top_members.length
      ? { title: `Top ${medspa ? "patients" : "members"}`, items: r.top_members.map((m) => ({ a: m.name, b: `${fmtNum(m.points)} pts`, v: m.points })) }
      : null;
  const vmax = bars ? Math.max(1, ...bars.items.map((x) => x.v)) : 1;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reportSubject(r))}</title></head><body style="margin:0;padding:0;background:#f2f1ef;font-family:${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
  ${hero ? `<tr><td style="padding:0;line-height:0"><img src="${esc(hero)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:200px;object-fit:cover;border:0" /></td></tr>` : ""}
  <tr><td style="background:${primary};padding:22px 28px;color:${onPrimary}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">
        <div style="font-size:13px;opacity:.8">${esc(r.business.name)} · Monthly report</div>
        <div style="font-family:${serif};font-size:30px;line-height:1.15;margin-top:4px">${esc(monthName(r.month))}</div>
      </td>
      ${logo ? `<td align="right" style="vertical-align:middle;width:1%;white-space:nowrap"><span style="display:inline-block;background:#ffffff;border-radius:10px;padding:7px 10px;line-height:0"><img src="${esc(logo)}" alt="${esc(r.business.name)}" height="34" style="display:block;height:34px;max-width:140px;width:auto;border:0" /></span></td>` : ""}
    </tr></table>
  </td></tr>
  ${secondary ? `<tr><td style="background:${secondary};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>` : ""}
  <tr><td style="padding:26px 28px 6px">
    <div style="font-size:15px;color:#3f3f46">Hi${firstName ? ` ${esc(firstName)}` : ""},</div>
    <div style="font-family:${serif};font-size:19px;line-height:1.5;color:#18181b;margin-top:10px">${esc(summary(r))}</div>
  </td></tr>
  <tr><td style="padding:16px 28px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececec;border-radius:12px">${rows.join("")}</table>
  </td></tr>
  ${ws ? `<tr><td style="padding:22px 28px 4px">
    <div style="font-size:13px;font-weight:700;color:#18181b;letter-spacing:.02em">Weekly home spin</div>
    <div style="font-size:13px;color:#52525b;margin-top:4px;line-height:1.5">${esc(ws.line)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border:1px solid #ececec;border-radius:12px">
      ${ws.rows.map((x, i) => {
        const color = !x.change ? "#a1a1aa" : x.change.dir === "up" ? "#15803d" : x.change.dir === "down" ? "#b91c1c" : "#71717a";
        return `<tr><td style="padding:10px 14px;${i ? "border-top:1px solid #f0f0f0;" : ""}font-size:13px;color:#3f3f46">${esc(x.label)}<div style="font-size:11px;color:#a1a1aa">${esc(x.hint)}</div></td>
          <td align="right" style="padding:10px 14px;${i ? "border-top:1px solid #f0f0f0;" : ""}white-space:nowrap"><span style="font-size:16px;font-weight:700;color:#18181b">${esc(x.value)}</span>${x.change ? `<div style="font-size:11px;color:${color}">${esc(x.change.text)}</div>` : ""}</td></tr>`;
      }).join("")}
    </table></td></tr>` : ""}
  ${tk.length ? `<tr><td style="padding:22px 28px 4px">
    <div style="font-size:13px;font-weight:700;color:#18181b;letter-spacing:.02em">Worth your attention</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${tk.map((t, i) => `<tr>
        <td style="width:28px;vertical-align:top;padding:10px 0;font-family:${serif};font-size:18px;color:${accent}">${i + 1}</td>
        <td style="vertical-align:top;padding:10px 0;${i ? "border-top:1px solid #f0f0f0;" : ""}">
          <div style="font-size:14px;font-weight:600;color:#18181b">${esc(t.title)}</div>
          <div style="font-size:13px;color:#52525b;margin-top:2px;line-height:1.5">${esc(t.body)}</div>
        </td></tr>`).join("")}
    </table></td></tr>` : ""}
  ${bars ? `<tr><td style="padding:18px 28px 4px">
    <div style="font-size:13px;font-weight:700;color:#18181b;letter-spacing:.02em">${esc(bars.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${bars.items.map((x) => `<tr><td style="padding:6px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:13px;color:#18181b">${esc(x.a)}</td><td align="right" style="font-size:12px;color:#71717a">${esc(x.b)}</td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px"><tr>
          <td style="width:${Math.max(4, Math.round((x.v / vmax) * 100))}%;background:${primary};height:6px;line-height:6px;font-size:0;border-radius:3px">&nbsp;</td>
          <td style="background:#f2f1ef;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr></table>
      </td></tr>`).join("")}
    </table></td></tr>` : ""}
  <tr><td style="padding:26px 28px 30px" align="left">
    <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${primary};color:${onPrimary};text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">Open the full report</a>
  </td></tr>
  <tr><td style="background:#fafaf9;border-top:1px solid #f0f0f0;padding:14px 28px;font-size:12px;color:#a1a1aa">
    Sent on the 1st of every month to ${esc(r.business.name)}'s managers · Powered by Atlas Engine
  </td></tr>
</table></td></tr></table></body></html>`;
}
