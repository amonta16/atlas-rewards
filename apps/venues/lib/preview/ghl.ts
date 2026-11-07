/**
 * lib/preview/ghl.ts — CP-232 · send a preview lead to GoHighLevel.
 *
 * GHL_INBOUND_WEBHOOK_URL is an "Inbound Webhook" trigger URL from a GHL
 * workflow (Automation → Workflows → trigger "Inbound Webhook"). We POST JSON;
 * the workflow maps the fields onto a contact and texts them. With no URL set
 * this logs and returns false; nothing else breaks.
 */

export type GhlPreviewLead = {
  event: "app_preview_created" | "app_preview_contact" | "app_preview_text_me";
  business_name: string;
  business_phone: string | null;
  website: string | null;
  address: string | null;
  slug: string;
  preview_url: string;
  /** The owner's own details (contact form, or the "text me" phone field). */
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  area_open?: boolean | null;
  source?: "manual" | "auto";
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

export async function postGhlLead(payload: GhlPreviewLead): Promise<boolean> {
  const url = process.env.GHL_INBOUND_WEBHOOK_URL;
  if (!url || !/^https:\/\//i.test(url)) {
    console.info(`[ghl] not configured, would have sent ${payload.event} for ${payload.slug}`);
    return false;
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
      cache: "no-store",
    });
    if (!r.ok) console.error("[ghl] webhook rejected", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error("[ghl] webhook failed", e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(t);
  }
}
