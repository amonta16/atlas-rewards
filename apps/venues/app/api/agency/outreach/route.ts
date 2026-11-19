import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { searchPlaces } from "@/lib/outreach/places-search";
import { db, enrichLead, loadSettings, runTick, stopLead, suppress } from "@/lib/outreach/engine";
import { sendMail, verifySmtp } from "@/lib/outreach/mailer";
import { verifyImap } from "@/lib/outreach/inbox";
import { postalAddress, smtpConfig, unsubscribeUrl } from "@/lib/outreach/config";
import { timezoneFor } from "@/lib/outreach/time";
import { EMAIL_RE, MANUAL_STATUSES, MAX_CAP, footer, hostOf, type LeadStatus } from "@/lib/outreach/shared";

/**
 * POST /api/agency/outreach — CP-250 · Admin → Outreach (agency_admin only). One endpoint, { action, ... }:
 *   search        { query, pageToken? }                 Places Text Search (nothing saved)
 *   add_places    { campaign_id?, places: PlaceHit[] }  save picked results as leads (dedup by place/domain)
 *   import        { campaign_id?, rows: [...] }         CSV rows: business_name, website, email, first_name, city, state, phone
 *   add_manual    { campaign_id?, ...one row }
 *   enrich        { lead_id, redraft? }                 read site + draft email 1
 *   approve       { message_id, subject, body }         save edits, approve (email 1 queues the lead)
 *   save_draft    { message_id, subject, body }
 *   skip          { lead_id }                           don't contact this spa
 *   update_lead   { lead_id, email?, first_name?, notes? }
 *   set_status    { lead_id, status }                   replied / booked / not interested / stopped
 *   retry         { message_id }                        a failed email back to approved
 *   handle_reply  { reply_id, lead_id? }                mark handled (and link to a lead)
 *   campaign      { name, area? } | { campaign_id, paused }
 *   save_step     { step, name, delay_days, subject, body, enabled }
 *   save_settings { daily_cap, send_days, window_start, window_end, approve_followups, paused, from_name, signature }
 *   suppress      { value }                             email or @domain
 *   check_mailbox                                       log in to SMTP + IMAP, send nothing
 *   test_email    { step? , subject, body }             send a preview to the admin's own email from the outreach mailbox
 *   run_now                                             one engine run now (ignores the random gap; still obeys OUTREACH_SEND)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const nul = (v: unknown, max = 200) => str(v, max) || null;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function admin(): Promise<{ id: string; email: string | null } | null> {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await server.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  return data?.length ? { id: user.id, email: user.email ?? null } : null;
}

type NewLead = {
  campaign_id: string | null; source: "places" | "csv" | "manual"; place_id?: string | null; business_name: string;
  address?: string | null; city?: string | null; state?: string | null; phone?: string | null; website?: string | null;
  domain?: string | null; rating?: number | null; reviews?: number | null; email?: string | null; email_source?: string | null;
  first_name?: string | null; timezone: string;
};

function leadFromRow(r: Record<string, unknown>, source: "csv" | "manual", campaign: string | null): NewLead | null {
  const name = str(r.business_name ?? r.name ?? r.business, 160);
  if (!name) return null;
  const website = nul(r.website ?? r.url, 400);
  const emailRaw = str(r.email, 200).toLowerCase();
  const email = EMAIL_RE.test(emailRaw) ? emailRaw : null;
  const state = nul(r.state, 40);
  return {
    campaign_id: campaign, source, business_name: name, website, domain: hostOf(website) ?? null,
    email, email_source: email ? source : null, first_name: nul(r.first_name ?? r.firstname, 60),
    city: nul(r.city, 80), state, phone: nul(r.phone, 40), timezone: timezoneFor(state),
  };
}

/** Insert one by one so a duplicate (same place, domain or email) is skipped, not fatal. */
async function insertLeads(rows: NewLead[]) {
  const d = db();
  let added = 0, dupes = 0;
  const ids: string[] = [];
  for (const r of rows) {
    const { data, error } = await d.from("outreach_leads").insert(r).select("id").maybeSingle();
    if (error) { if (error.code === "23505") dupes++; else throw new Error(error.message); continue; }
    if (data) { added++; ids.push(String(data.id)); }
  }
  return { added, dupes, ids };
}

export async function POST(req: Request) {
  const me = await admin();
  if (!me) return bad("Admins only.", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const d = db();
  const campaign = typeof b.campaign_id === "string" && UUID.test(b.campaign_id) ? b.campaign_id : null;
  const leadId = typeof b.lead_id === "string" && UUID.test(b.lead_id) ? b.lead_id : null;
  const msgId = typeof b.message_id === "string" && UUID.test(b.message_id) ? b.message_id : null;

  try {
    switch (b.action) {
      case "search": {
        const query = str(b.query, 200);
        if (query.length < 3) return bad("Type what to search for, e.g. \"med spa in Fresno, CA\".");
        const { hits, next } = await searchPlaces(query, nul(b.pageToken, 600));
        // Mark the ones already in the list.
        const placeIds = hits.map((h) => h.placeId);
        const domains = hits.map((h) => hostOf(h.website)).filter(Boolean) as string[];
        const [byPlace, byDomain] = await Promise.all([
          d.from("outreach_leads").select("place_id").in("place_id", placeIds),
          domains.length ? d.from("outreach_leads").select("domain").in("domain", domains) : Promise.resolve({ data: [] as { domain: string }[] }),
        ]);
        const havePlace = new Set((byPlace.data ?? []).map((r) => r.place_id));
        const haveDomain = new Set((byDomain.data ?? []).map((r) => r.domain));
        return NextResponse.json({ next, hits: hits.map((h) => ({ ...h, have: havePlace.has(h.placeId) || (!!hostOf(h.website) && haveDomain.has(hostOf(h.website)!)) })) });
      }

      case "add_places": {
        const list = Array.isArray(b.places) ? (b.places as Record<string, unknown>[]).slice(0, 60) : [];
        const rows: NewLead[] = list.map((p) => {
          const website = nul(p.website, 400);
          const state = nul(p.state, 40);
          return {
            campaign_id: campaign, source: "places" as const, place_id: nul(p.placeId, 300), business_name: str(p.name, 160),
            address: nul(p.address, 240), city: nul(p.city, 80), state, phone: nul(p.phone, 40), website, domain: hostOf(website),
            rating: typeof p.rating === "number" ? p.rating : null, reviews: typeof p.reviews === "number" ? p.reviews : null,
            timezone: timezoneFor(state),
          };
        }).filter((r) => r.business_name && r.place_id);
        return NextResponse.json(await insertLeads(rows));
      }

      case "import": {
        const list = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]).slice(0, 500) : [];
        const rows = list.map((r) => leadFromRow(r, "csv", campaign)).filter(Boolean) as NewLead[];
        if (!rows.length) return bad("No rows with a business name. Columns: business_name, website, email, first_name, city, state, phone.");
        return NextResponse.json(await insertLeads(rows));
      }

      case "add_manual": {
        const row = leadFromRow(b, "manual", campaign);
        if (!row) return bad("A business name is needed.");
        if (!row.website && !row.email) return bad("Add a website or an email.");
        const r = await insertLeads([row]);
        if (!r.added) return bad("That spa (same website or email) is already in the list.");
        return NextResponse.json(r);
      }

      case "enrich": {
        if (!leadId) return bad("Bad lead.");
        return NextResponse.json(await enrichLead(leadId, { redraft: b.redraft === true }));
      }

      case "approve":
      case "save_draft": {
        if (!msgId) return bad("Bad email.");
        const subject = str(b.subject, 160);
        const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim().slice(0, 4000) : "";
        if (!body) return bad("The email is empty.");
        const { data: m } = await d.from("outreach_messages").select("id, lead_id, step, status").eq("id", msgId).maybeSingle();
        if (!m) return bad("Email not found.");
        if (!["draft", "approved"].includes(String(m.status))) return bad("That email was already sent or cancelled.");
        if (m.step === 1 && !subject) return bad("Email 1 needs a subject.");
        if (/https?:\/\//i.test(body) && m.step === 1) return bad("Keep links out of email 1: it lands in the inbox more often. Links go in email 2.");
        const approve = b.action === "approve";
        await d.from("outreach_messages").update({ subject, body, ...(approve ? { status: "approved", approved_at: new Date().toISOString(), approved_by: me.id } : {}) }).eq("id", msgId);
        if (approve && m.step === 1) {
          const { data: lead } = await d.from("outreach_leads").select("email").eq("id", m.lead_id).maybeSingle();
          if (!lead?.email) return bad("This spa has no email yet.");
          await d.from("outreach_leads").update({ status: "queued", next_at: null, updated_at: new Date().toISOString() }).eq("id", m.lead_id);
        }
        return NextResponse.json({ ok: true });
      }

      case "skip": {
        if (!leadId) return bad("Bad lead.");
        await stopLead(leadId, "stopped", "Skipped in review");
        return NextResponse.json({ ok: true });
      }

      case "update_lead": {
        if (!leadId) return bad("Bad lead.");
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ("email" in b) {
          const e = str(b.email, 200).toLowerCase();
          if (e && !EMAIL_RE.test(e)) return bad("That email doesn't look right.");
          patch.email = e || null; patch.email_source = e ? "manual" : null; patch.email_mx_ok = null;
        }
        if ("first_name" in b) patch.first_name = nul(b.first_name, 60);
        if ("notes" in b) patch.notes = nul(b.notes, 2000);
        const { error } = await d.from("outreach_leads").update(patch).eq("id", leadId);
        if (error) return bad(error.code === "23505" ? "Another lead already has that email." : error.message);
        // A spa that had no email can now be drafted.
        if (patch.email) {
          const { data: l } = await d.from("outreach_leads").select("status").eq("id", leadId).maybeSingle();
          if (l?.status === "no_email") return NextResponse.json(await enrichLead(leadId));
        }
        return NextResponse.json({ ok: true });
      }

      case "set_status": {
        if (!leadId) return bad("Bad lead.");
        const status = MANUAL_STATUSES.find((s) => s === b.status) as LeadStatus | undefined;
        if (!status) return bad("Bad status.");
        if (status === "not_interested") {
          const { data: l } = await d.from("outreach_leads").select("email").eq("id", leadId).maybeSingle();
          if (l?.email) await suppress(String(l.email), "not_interested");
        }
        await stopLead(leadId, status, "Set by hand");
        return NextResponse.json({ ok: true });
      }

      case "retry": {
        if (!msgId) return bad("Bad email.");
        await d.from("outreach_messages").update({ status: "approved", error: null }).eq("id", msgId).eq("status", "failed");
        return NextResponse.json({ ok: true });
      }

      case "handle_reply": {
        const rid = typeof b.reply_id === "string" && UUID.test(b.reply_id) ? b.reply_id : null;
        if (!rid) return bad("Bad reply.");
        await d.from("outreach_replies").update({ handled: true, ...(leadId ? { lead_id: leadId } : {}) }).eq("id", rid);
        if (leadId) await stopLead(leadId, "replied", "Replied (linked by hand)", { last_reply_at: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }

      case "campaign": {
        if (campaign && typeof b.paused === "boolean") {
          await d.from("outreach_campaigns").update({ paused: b.paused }).eq("id", campaign);
          return NextResponse.json({ ok: true });
        }
        const name = str(b.name, 80);
        if (!name) return bad("Name the campaign, e.g. \"Fresno med spas\".");
        const { data, error } = await d.from("outreach_campaigns").insert({ name, area: nul(b.area, 120) }).select("id").single();
        if (error) return bad(error.message, 500);
        return NextResponse.json({ ok: true, id: data.id });
      }

      case "save_step": {
        const step = Number(b.step);
        const delay = Math.round(Number(b.delay_days));
        const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").slice(0, 4000) : "";
        if (!Number.isInteger(step) || step < 1 || step > 10) return bad("Bad step.");
        if (!Number.isFinite(delay) || delay < 0 || delay > 60) return bad("Wait between 0 and 60 days.");
        if (!body.trim()) return bad("The email is empty.");
        if (step === 1 && !str(b.subject, 160)) return bad("Email 1 needs a subject.");
        const { error } = await d.from("outreach_steps").upsert({
          step, name: str(b.name, 60) || `Step ${step}`, delay_days: step === 1 ? 0 : delay, subject: str(b.subject, 160), body,
          enabled: b.enabled !== false, ai: step === 1 ? b.ai !== false : false, updated_at: new Date().toISOString(),
        }, { onConflict: "step" });
        if (error) return bad(`Couldn't save: ${error.message}. Has the CP-250 SQL been applied?`, 500);
        return NextResponse.json({ ok: true });
      }

      case "save_settings": {
        const cap = Math.round(Number(b.daily_cap));
        const ws = Math.round(Number(b.window_start)), we = Math.round(Number(b.window_end));
        const days = Array.isArray(b.send_days) ? Array.from(new Set((b.send_days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))) : [];
        if (!Number.isFinite(cap) || cap < 0 || cap > MAX_CAP) return bad(`Keep the daily cap between 0 and ${MAX_CAP} per mailbox.`);
        if (!(ws >= 0 && we <= 24 && we > ws)) return bad("The send window doesn't make sense.");
        if (!days.length) return bad("Pick at least one send day.");
        const signature = typeof b.signature === "string" ? b.signature.replace(/\r\n/g, "\n").trim().slice(0, 400) : "";
        const fromName = str(b.from_name, 80);
        if (!signature || !fromName) return bad("A From name and a signature are needed (CAN-SPAM: say who you are).");
        const paused = b.paused === true;
        const { error } = await d.from("outreach_settings").update({
          daily_cap: cap, window_start: ws, window_end: we, send_days: days, approve_followups: b.approve_followups === true,
          paused, ...(paused ? {} : { paused_reason: null }), from_name: fromName, signature, updated_at: new Date().toISOString(),
        }).eq("id", 1);
        if (error) return bad(`Couldn't save: ${error.message}. Has the CP-250 SQL been applied?`, 500);
        return NextResponse.json({ ok: true });
      }

      case "suppress": {
        const v = str(b.value, 200).toLowerCase();
        if (!(EMAIL_RE.test(v) || /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(v))) return bad("Enter an email or @domain.com.");
        await suppress(v, "manual");
        return NextResponse.json({ ok: true });
      }

      case "check_mailbox": {
        if (!smtpConfig()) return bad("Set OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Vercel first.");
        const [smtp, imap] = await Promise.all([verifySmtp(), verifyImap()]);
        return NextResponse.json({ smtp: smtp ?? "ok", imap: imap ?? "ok" });
      }

      case "test_email": {
        if (!me.email) return bad("Your account has no email address.");
        if (!smtpConfig()) return bad("Set up the outreach mailbox first (OUTREACH_SMTP_USER / OUTREACH_SMTP_PASS).");
        const subject = str(b.subject, 160) || "Outreach test";
        const body = typeof b.body === "string" ? b.body.slice(0, 4000) : "";
        if (!body.trim()) return bad("Nothing to send.");
        const s = await loadSettings();
        const unsub = unsubscribeUrl("00000000-0000-0000-0000-000000000000");
        await sendMail({ to: me.email, subject: `[TEST] ${subject}`, text: `${body.trim()}\n\n${footer(s.signature, postalAddress(), unsub)}`, fromName: s.from_name, unsubscribeUrl: unsub });
        return NextResponse.json({ ok: true, to: me.email });
      }

      case "run_now":
        return NextResponse.json(await runTick({ force: true }));

      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    console.error("[outreach admin]", b.action, e);
    return bad(e instanceof Error ? e.message.slice(0, 200) : "Something went wrong.", 500);
  }
}
