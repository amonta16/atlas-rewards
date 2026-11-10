/**
 * lib/preview/email.ts — CP-235 · the "your app is ready" email, branded with the spa's own app.
 *
 * Their logo, their banner photo, a big button in their brand color, three
 * reasons it matters, and "Book a walkthrough". Table layout + inline styles so
 * it renders in Gmail, Outlook and Apple Mail. Every value from the row is
 * escaped; images and links only come from our own storage and domains.
 * Sent once the build is ready (waits up to ~90 s after the contact form).
 */
import { emailProspect } from "@/lib/landing/notify";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { getPreviewBySlug, previewUrl, type PreviewRow } from "./store";
import { verifiedDeskUrl } from "./verify-link";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const hosted = (u: string | null | undefined) => (u && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\//.test(u) ? u : null);
const hex = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : "#0B5FD6");

const PITCH: Record<string, string> = {
  recall: "Reminders before each patient's treatment wears off",
  memberships: "Memberships that bill every month",
  slow_days: "Offers sent to patients' phones on slow days",
  reviews: "Points for reviews and referrals",
  packages: "Packages and skincare patients buy in the app",
};

export function previewEmail(row: Pick<PreviewRow, "slug" | "business_name" | "logo_url" | "logo_is_monogram" | "hero_url" | "colors" | "expires_at" | "priorities">, firstName: string) {
  const spa = esc(row.business_name);
  const first = esc(firstName || row.business_name); // no name since the audit's step 3 gate: their spa's name, never "there"
  const url = previewUrl(row.slug);
  const walkthrough = `${SITE_ORIGIN}/medspa/walkthrough/${row.slug}`;
  const brand = hex((row.colors as { primary?: string } | null)?.primary);
  const logo = row.logo_is_monogram ? null : hosted(row.logo_url);
  const hero = hosted(row.hero_url);
  const until = new Date(row.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const picked = (row.priorities ?? []).filter((p) => PITCH[p]);
  const bullets = [...picked, ...["recall", "memberships", "reviews"].filter((p) => !picked.includes(p))].slice(0, 3).map((p) => PITCH[p]);
  const subject = `${row.business_name}'s app is ready`;

  const text = [
    `Hi ${firstName || row.business_name},`,
    "",
    `Your preview of ${row.business_name}'s own patient app is ready:`,
    url,
    "",
    "Open it on your phone and tap around. It has your logo, colors and treatments.",
    ...bullets.map((b) => `• ${b}`),
    "",
    `Want it live? Book a walkthrough: ${walkthrough}`,
    `Your preview is saved until ${until}. Questions? Just reply.`,
    "",
    "Andrew, Atlas Engine",
  ].join("\n");

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F2F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1B2B;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your ${spa} app is ready. Open it on your phone and tap around.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F9;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="padding:0 6px 18px;"><img src="${SITE_ORIGIN}/landing/atlas-engine-logo-navy.png" width="110" alt="Atlas Engine" style="display:block;height:auto;border:0;"></td></tr>
  <tr><td style="background:#FFFFFF;border-radius:22px;padding:28px 28px 26px;box-shadow:0 18px 40px -28px rgba(11,27,43,.35);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:18px;">${logo
        ? `<img src="${logo}" alt="${spa}" height="44" style="display:block;height:44px;width:auto;max-width:220px;border:0;">`
        : `<div style="font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${brand};">${spa}</div>`}</td></tr>
      ${hero ? `<tr><td style="padding-bottom:22px;"><img src="${hero}" alt="" width="504" style="display:block;width:100%;max-width:504px;height:auto;border-radius:16px;border:0;"></td></tr>` : ""}
      <tr><td style="font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-.02em;color:#0B1B2B;padding-bottom:10px;">${first}, your app is ready.</td></tr>
      <tr><td style="font-size:16px;line-height:1.55;color:#3A4A5C;padding-bottom:22px;">We built ${spa}&#39;s own patient app from your website, with your logo, colors and treatments. Open it on your phone and tap around.</td></tr>
      <tr><td align="center" style="padding-bottom:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${brand}" style="border-radius:999px;">
          <a href="${url}" style="display:inline-block;padding:16px 34px;font-size:17px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">Open ${spa}&#39;s app &rarr;</a>
        </td></tr></table>
      </td></tr>
      ${bullets.map((b) => `<tr><td style="padding:0 0 10px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="26" valign="top" style="padding-top:1px;"><div style="width:20px;height:20px;border-radius:10px;background:${brand};color:#FFFFFF;font-size:13px;line-height:20px;text-align:center;font-weight:700;">&#10003;</div></td>
        <td style="font-size:15px;line-height:1.45;color:#0B1B2B;">${esc(b)}</td></tr></table></td></tr>`).join("")}
      <tr><td style="padding-top:14px;border-top:1px solid #E6EBF2;"></td></tr>
      <tr><td align="center" style="font-size:15px;color:#3A4A5C;padding-bottom:12px;">Want it live at your front desk?</td></tr>
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:999px;border:1.5px solid #0B1B2B;">
          <a href="${walkthrough}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#0B1B2B;text-decoration:none;">Book a walkthrough</a>
        </td></tr></table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 8px 0;font-size:13px;line-height:1.55;color:#6B7A8C;text-align:center;">
    Your preview is saved until ${esc(until)}. Questions? Just reply to this email.<br>Andrew, Atlas Engine &middot; <a href="${SITE_ORIGIN}" style="color:#6B7A8C;">atlas-engine.app</a>
  </td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

/* ───────────── CP-237 · the welcome email, sent when the owner finishes the funnel ───────────── */

type WelcomeRow = Pick<PreviewRow, "slug" | "business_name" | "logo_url" | "logo_is_monogram" | "hero_url" | "colors" | "expires_at" | "treatments" | "treatments_are_examples"> & { contact_email?: string | null };

/**
 * "Your app is ready. Open your front desk." Their logo and banner photo, a big
 * button in their brand color that opens med.atlas-engine.app/<slug>/desk, and a
 * small picture of the desk's sidebar where each row deep-links to that part of
 * the desk (App Builder, Memberships, Offers). Then the patient app and the walkthrough.
 */
export function welcomeEmail(row: WelcomeRow, firstName: string) {
  const spa = esc(row.business_name);
  const first = esc(firstName || row.business_name); // no name since the audit's step 3 gate: their spa's name, never "there"
  const app = previewUrl(row.slug);
  const desk = verifiedDeskUrl(row.slug, row.contact_email); // audit step 4: opening it marks the email verified
  const walkthrough = `${SITE_ORIGIN}/medspa/walkthrough/${row.slug}`;
  const brand = hex((row.colors as { primary?: string } | null)?.primary);
  const logo = row.logo_is_monogram ? null : hosted(row.logo_url);
  const hero = hosted(row.hero_url);
  const until = new Date(row.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const n = row.treatments_are_examples ? 0 : (row.treatments ?? []).length;
  const subject = `${row.business_name}'s app is ready. Here's your front desk.`;

  // What the owner can set up first, each linked to its place on the desk.
  const rows: Array<{ t: string; d: string; view: string }> = [
    { t: "Treatments and booking", d: n ? `${n} treatments from your website, ready to edit` : "A starter menu, ready for your real treatments", view: "builder" },
    { t: "Rewards", d: "Points for visits, reviews and referrals", view: "builder" },
    { t: "Memberships", d: "Monthly plans with member pricing", view: "memberships" },
    { t: "Offers", d: "Send an offer to patients' phones", view: "offers" },
  ];

  const text = [
    `Hi ${firstName || row.business_name},`,
    "",
    `${row.business_name}'s app is ready, and so is your front desk: the screen your team uses to check patients in and set up the app.`,
    "",
    `Open your front desk: ${desk}`,
    "",
    "Start here:",
    ...rows.map((r) => `• ${r.t}: ${r.d}`),
    "",
    `See the patient app: ${app}`,
    `Want it live? Book a 15-minute walkthrough: ${walkthrough}`,
    "",
    `This is a preview, saved until ${until}. Nothing you try reaches patients until you go live. Questions? Just reply.`,
    "",
    "Andrew, Atlas Engine",
  ].join("\n");

  const pill = (href: string, label: string, solid: boolean) => solid
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${brand}" style="border-radius:999px;"><a href="${href}" style="display:inline-block;padding:16px 34px;font-size:17px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${label}</a></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:999px;border:1.5px solid #0B1B2B;"><a href="${href}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#0B1B2B;text-decoration:none;">${label}</a></td></tr></table>`;

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F2F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1B2B;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${spa}&#39;s app is ready. Open your front desk to set up treatments, rewards and memberships.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F9;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="padding:0 6px 18px;"><img src="${SITE_ORIGIN}/landing/atlas-engine-logo-navy.png" width="110" alt="Atlas Engine" style="display:block;height:auto;border:0;"></td></tr>
  <tr><td style="background:#FFFFFF;border-radius:22px;padding:28px 28px 26px;box-shadow:0 18px 40px -28px rgba(11,27,43,.35);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:18px;">${logo
        ? `<img src="${logo}" alt="${spa}" height="44" style="display:block;height:44px;width:auto;max-width:220px;border:0;">`
        : `<div style="font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${brand};">${spa}</div>`}</td></tr>
      ${hero ? `<tr><td style="padding-bottom:22px;"><img src="${hero}" alt="" width="504" style="display:block;width:100%;max-width:504px;height:auto;border-radius:16px;border:0;"></td></tr>` : ""}
      <tr><td style="font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-.02em;color:#0B1B2B;padding-bottom:10px;">${first}, your app is ready.</td></tr>
      <tr><td style="font-size:16px;line-height:1.55;color:#3A4A5C;padding-bottom:22px;">We built ${spa}&#39;s patient app from your website, and your front desk with it: the screen your team uses to check patients in and to set up the app.</td></tr>
      <tr><td align="center" style="padding-bottom:26px;">${pill(desk, "Open my front desk &rarr;", true)}</td></tr>

      <!-- The desk, in miniature: Atlas sidebar header, then the four places to start. -->
      <tr><td style="padding-bottom:22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6EBF2;border-radius:16px;background:#FBFBFB;">
          <tr><td style="padding:14px 16px 10px;border-bottom:1px solid #E6EBF2;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:13px;font-weight:700;color:#0B1B2B;">${spa} &middot; Front desk</td>
              <td align="right" style="font-size:12px;color:#6B7A8C;">Start here</td>
            </tr></table>
          </td></tr>
          ${rows.map((r, i) => `<tr><td style="padding:0 8px;">
            <a href="${desk}${desk.includes("?") ? "&amp;" : "?"}view=${r.view}" style="display:block;text-decoration:none;color:#0B1B2B;${i ? "border-top:1px solid #EEF1F5;" : ""}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="36" valign="middle" style="padding:12px 0 12px 8px;"><div style="width:26px;height:26px;border-radius:9px;background:${brand};color:#FFFFFF;font-size:13px;line-height:26px;text-align:center;font-weight:700;">${i + 1}</div></td>
                <td valign="middle" style="padding:12px 6px;"><div style="font-size:15px;font-weight:700;color:#0B1B2B;">${esc(r.t)}</div><div style="font-size:13px;line-height:1.4;color:#6B7A8C;padding-top:2px;">${esc(r.d)}</div></td>
                <td width="18" valign="middle" align="right" style="padding-right:8px;font-size:18px;color:${brand};">&rsaquo;</td>
              </tr></table>
            </a>
          </td></tr>`).join("")}
        </table>
      </td></tr>

      <tr><td align="center" style="font-size:15px;color:#3A4A5C;padding-bottom:12px;">See what your patients see:</td></tr>
      <tr><td align="center" style="padding-bottom:22px;">${pill(app, `Open ${spa}&#39;s app`, false)}</td></tr>
      <tr><td style="padding-top:14px;border-top:1px solid #E6EBF2;"></td></tr>
      <tr><td align="center" style="font-size:15px;color:#3A4A5C;padding-bottom:8px;">Want it live at your front desk?</td></tr>
      <tr><td align="center"><a href="${walkthrough}" style="font-size:15px;font-weight:700;color:${brand};text-decoration:underline;">Book a 15-minute walkthrough</a></td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 8px 0;font-size:13px;line-height:1.55;color:#6B7A8C;text-align:center;">
    This is a preview, saved until ${esc(until)}. Nothing you try reaches patients until you go live.<br>Questions? Just reply to this email.<br>Andrew, Atlas Engine &middot; <a href="${SITE_ORIGIN}" style="color:#6B7A8C;">atlas-engine.app</a>
  </td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The funnel's scan animation runs at least 22 s (SCAN_MS in preview-start.tsx); the email lands after it. */
const AFTER_ANIMATION_MS = 26_000;

/**
 * CP-237 · called from /api/preview/answers (the last step). Waits until the scan animation
 * has played and the build is really done, so the inbox never says "ready" before the page does,
 * then sends the welcome email to the contact on the row. Never throws.
 */
export async function sendWelcomeEmail(slug: string): Promise<boolean> {
  try {
    const t0 = Date.now();
    await sleep(AFTER_ANIMATION_MS);
    let row = await getPreviewBySlug(slug);
    while (row && row.status === "building" && Date.now() - t0 < 200_000) {
      await sleep(4000);
      row = await getPreviewBySlug(slug);
    }
    if (!row?.contact_email || row.status === "building" || row.status === "failed") return false;
    const first = (row.contact_name ?? "").split(/\s+/)[0] ?? "";
    const { subject, text, html } = welcomeEmail(row, first);
    return await emailProspect(row.contact_email, subject, text, html);
  } catch (e) {
    console.error("[preview] welcome email failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** How long after the contact form we wait for the owner to finish before emailing the plain "ready" link. */
const ABANDON_MS = 255_000;

/**
 * CP-237 · called from /api/preview/contact. Before, this sent "your app is ready" as soon as the
 * build finished, which was usually while the owner was still answering the quiz, i.e. before the
 * funnel's own build animation. Now it waits: if they finish the funnel (quiz_at set), the welcome
 * email above takes over and this sends nothing; if they stop partway, it sends the "ready" email
 * so they still get their link. Never throws.
 */
export async function sendPreviewEmailIfAbandoned(slug: string, to: string, firstName: string): Promise<boolean> {
  try {
    const t0 = Date.now();
    let row = await getPreviewBySlug(slug);
    while (row && !row.quiz_at && Date.now() - t0 < ABANDON_MS) {
      await sleep(5000);
      row = await getPreviewBySlug(slug);
    }
    if (!row || row.quiz_at || row.status === "building" || row.status === "failed") return false;
    const { subject, text, html } = previewEmail(row, firstName);
    return await emailProspect(to, subject, text, html);
  } catch (e) {
    console.error("[preview] email failed", e instanceof Error ? e.message : e);
    return false;
  }
}
