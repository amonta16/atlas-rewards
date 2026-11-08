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
  const first = esc(firstName || "there");
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
    `Hi ${firstName || "there"},`,
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

/**
 * Waits for the build (up to ~90 s, since the contact form usually comes first) so the
 * email can show their logo, photo and color, then sends it. Never throws.
 */
export async function sendPreviewEmail(slug: string, to: string, firstName: string): Promise<boolean> {
  try {
    let row = await getPreviewBySlug(slug);
    for (let i = 0; row && row.status === "building" && i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      row = await getPreviewBySlug(slug);
    }
    if (!row) return false;
    const { subject, text, html } = previewEmail(row, firstName);
    return await emailProspect(to, subject, text, html);
  } catch (e) {
    console.error("[preview] email failed", e instanceof Error ? e.message : e);
    return false;
  }
}
