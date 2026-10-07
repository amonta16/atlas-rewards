import { createAdminClient } from "@/lib/supabase/admin";
import { verify } from "@/lib/landing/funnel-sign";
import { sendCapiEvent, splitName } from "@/lib/landing/meta-capi";
import { DEFAULT_PURCHASE_VALUE, SITE_ORIGIN } from "@/lib/landing/medspa-funnel";

/**
 * GET /api/landing/outcome?id=<request id>&o=showed|no_show|paid|lost&s=<sig>[&v=<value>] — CP-201
 *
 * Andrew's one-tap buttons from the "How did it go?" email. Signed links
 * (lib/landing/funnel-sign.ts), so no login needed and nobody else can use them.
 *   paid → lead status paid + Meta "Purchase" via the Conversions API, valued at
 *          ?v= if given (e.g. first month or first 3 months), else DEFAULT_PURCHASE_VALUE.
 * Tapping a different button later overwrites the outcome (Purchase is only sent once).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTCOMES = ["showed", "no_show", "paid", "lost"] as const;
type Outcome = (typeof OUTCOMES)[number];
const LABEL: Record<Outcome, string> = { showed: "Showed, still deciding", no_show: "No-show", paid: "Paid", lost: "Not a fit" };

function page(title: string, body: string, ok = true) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#F6F9FD;color:#0B1B2B;display:grid;place-items:center;min-height:100vh}
.c{background:#fff;border:1px solid rgba(11,27,43,.1);border-radius:28px;padding:32px;max-width:420px;margin:16px;box-shadow:0 30px 60px -45px rgba(6,49,143,.35)}
h1{font-size:22px;margin:0 0 8px;letter-spacing:-.02em}p{color:#3A4A5C;line-height:1.5;margin:8px 0}.b{display:inline-block;width:10px;height:10px;border-radius:99px;background:${ok ? "#0B5FD6" : "#c2410c"};margin-right:8px}
a{color:#0B5FD6;font-weight:600}form{margin-top:16px;display:flex;gap:8px}input{flex:1;height:40px;border:1px solid rgba(11,27,43,.15);border-radius:12px;padding:0 12px;font-size:15px}
button{height:40px;border:0;border-radius:99px;padding:0 16px;background:#0B5FD6;color:#fff;font-weight:700}</style></head>
<body><div class="c"><h1><span class="b"></span>${title}</h1>${body}</div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const o = (u.searchParams.get("o") ?? "") as Outcome;
  if (!OUTCOMES.includes(o) || !/^[0-9a-f-]{36}$/i.test(id) || !verify(u.searchParams.get("s"), id, o)) {
    return page("That link didn't check out", "<p>It may have been copied incompletely. Open it again from the email.</p>", false);
  }

  const db = createAdminClient();
  const { data: r } = await db.from("landing_demo_requests")
    .select("id, name, business, email, phone, lead_id, outcome, paid_value, fbp, fbc, user_agent").eq("id", id).maybeSingle();
  if (!r) return page("Booking not found", "<p>It may have been deleted.</p>", false);

  const vRaw = u.searchParams.get("v");
  const value = o === "paid" ? (vRaw && Number(vRaw) > 0 ? Math.round(Number(vRaw)) : (r.paid_value ?? DEFAULT_PURCHASE_VALUE)) : null;
  const firstPaid = o === "paid" && r.outcome !== "paid";

  await db.from("landing_demo_requests").update({
    outcome: o, outcome_at: new Date().toISOString(), ...(o === "paid" ? { paid_value: value } : {}),
    status: o === "paid" ? "closed" : "contacted",
  }).eq("id", id);
  if (r.lead_id) await db.from("landing_leads").update({ status: o }).eq("id", r.lead_id);

  let capi = "";
  if (firstPaid) {
    const n = splitName(r.name ?? "");
    const ok = await sendCapiEvent({
      name: "Purchase", eventId: `purchase_${id}`, sourceUrl: `${SITE_ORIGIN}/medspa`, actionSource: "system_generated",
      user: { email: r.email, phone: r.phone, firstName: n.first, lastName: n.last, fbp: r.fbp, fbc: r.fbc, userAgent: r.user_agent, externalId: r.lead_id ?? id },
      customData: { currency: "USD", value: value ?? DEFAULT_PURCHASE_VALUE, content_name: "atlas_medspa_plan" },
    });
    capi = ok ? "<p>Meta got the Purchase event, so the ads learn who actually buys.</p>" : "<p>Saved. Meta's Conversions API isn't set up yet (META_CAPI_TOKEN), so no Purchase event was sent.</p>";
  }

  const sig = u.searchParams.get("s") ?? "";
  const valueForm = o === "paid"
    ? `<p>Value sent to Meta: <b>$${(value ?? 0).toLocaleString()}</b>. Different amount?</p><form method="get"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="o" value="paid"><input type="hidden" name="s" value="${esc(sig)}"><input name="v" inputmode="numeric" placeholder="e.g. 1500"><button>Save</button></form>`
    : "";
  return page(`${esc(r.business ?? "Lead")}: ${LABEL[o]}`, `<p>Saved for ${esc(r.name ?? "")}.</p>${capi}${valueForm}`);
}
