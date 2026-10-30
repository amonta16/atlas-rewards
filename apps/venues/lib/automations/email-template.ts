/**
 * lib/automations/email-template.ts — CP-217 · one branded email layout
 *
 * Used by BOTH the email dispatcher (app/api/automations/email-dispatch) and
 * the hub's email preview, so what admins see is exactly what patients get.
 * Pure function: no React, no fetching, safe on server and client.
 */

export type EmailBrand = {
  businessName: string;
  logoUrl: string | null;
  primary: string;          // brand hex
  heroUrl?: string | null;  // optional banner image
  address?: string | null;  // footer line (CAN-SPAM wants a postal address)
};

export type EmailContent = {
  subject: string;
  preheader?: string;
  heading?: string | null;
  body: string;             // plain text, blank line = new paragraph
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footnote?: string | null; // e.g. "+200 points when you book by Friday"
  unsubscribeUrl: string;
};

/** Sender shown in the inbox. Atlas sends from its verified domain; replies go to the clinic. */
export const EMAIL_FROM_ADDRESS = "hello@atlas-engine.app";
export function emailFrom(businessName: string) {
  const name = businessName.replace(/["<>]/g, "").trim() || "Your clinic";
  return { name, address: EMAIL_FROM_ADDRESS, header: `${name} <${EMAIL_FROM_ADDRESS}>` };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHex = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? h : "#2d6a78");

export function renderEmail(brand: EmailBrand, c: EmailContent): { html: string; text: string } {
  const p = safeHex(brand.primary);
  const paras = c.body.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#262b3d;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader ?? paras[0] ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:1px solid #eef0f2">
${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.businessName)}" height="34" style="height:34px;max-width:180px;object-fit:contain;display:block">` : `<div style="font-size:18px;font-weight:700;color:${p}">${esc(brand.businessName)}</div>`}
</td></tr>
${brand.heroUrl ? `<tr><td><img src="${esc(brand.heroUrl)}" alt="" width="560" style="width:100%;max-height:220px;object-fit:cover;display:block"></td></tr>` : ""}
<tr><td style="padding:28px 28px 8px">
${c.heading ? `<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:700;color:#262b3d">${esc(c.heading)}</h1>` : ""}
${paras.map((x) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4a5060">${esc(x).replace(/\n/g, "<br>")}</p>`).join("")}
</td></tr>
${c.ctaLabel && c.ctaUrl ? `<tr><td style="padding:6px 28px 8px"><a href="${esc(c.ctaUrl)}" style="display:inline-block;background:${p};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 26px;border-radius:999px">${esc(c.ctaLabel)}</a></td></tr>` : ""}
${c.footnote ? `<tr><td style="padding:10px 28px 0"><div style="background:${p}14;border-radius:12px;padding:12px 14px;font-size:14px;color:#262b3d">${esc(c.footnote)}</div></td></tr>` : ""}
<tr><td style="padding:26px 28px 24px;font-size:12px;line-height:1.6;color:#8b909c;border-top:1px solid #eef0f2;margin-top:18px">
You're getting this because you joined ${esc(brand.businessName)}'s rewards app.${brand.address ? `<br>${esc(brand.address)}` : ""}<br>
<a href="${esc(c.unsubscribeUrl)}" style="color:#8b909c">Unsubscribe from emails</a>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.heading, ...paras, c.ctaLabel && c.ctaUrl ? `${c.ctaLabel}: ${c.ctaUrl}` : null, c.footnote,
    `—\nYou're getting this because you joined ${brand.businessName}'s rewards app.${brand.address ? `\n${brand.address}` : ""}\nUnsubscribe: ${c.unsubscribeUrl}`]
    .filter(Boolean).join("\n\n");
  return { html, text };
}
