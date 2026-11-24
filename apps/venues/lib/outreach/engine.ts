/**
 * lib/outreach/engine.ts — CP-250 · the outreach loop, run by /api/outreach/tick every 5 minutes
 * (and by "Run now" in the admin). Each run, in order:
 *   1. Inbox    new mail in the outreach mailbox → replies, bounces, auto-replies matched to leads.
 *               A reply stops that lead's sequence; "no thanks"/unsubscribe/bounce also suppress it.
 *   2. Booked   a lead whose email booked a demo or opted in on /medspa → Booked, sequence stops.
 *   3. Read     up to 2 new leads: skip spas already in Atlas, read their site, pick the email, Claude
 *               judges fit and writes the opener (or the whole email 1) → Review.
 *   4. Next     contacted leads whose next step is due get that step: an email (templated, approved or
 *               in Review) or, for a call or Instagram step (CP-250c), a task on the To-do list that
 *               you do by hand. Nothing on Instagram is ever sent automatically.
 *   5. Send     at most ONE email per run, only inside the lead's send window, under the daily cap,
 *               after the random gap since the last send. Stamped 'sending' first so a retry can
 *               never double-send. Without OUTREACH_SEND=1 nothing goes out: the run reports what
 *               it would send.
 *   6. Guard    more than 5% bounces over the last 7 days (with 20+ sent) pauses sending.
 *   +  Warm-up  CP-250e: at most one warm-up email to a friend/family address (warmup-run.ts), even while
 *               real spas are paused. Replies and bounces from those addresses are logged as warm-up.
 */
import { previewDb } from "@/lib/preview/store";
import { PREVIEW_LINK, BOOK_LINK, fromAddress, postalAddress, sendLive, unsubscribeUrl } from "./config";
import { readSite } from "./enrich";
import { classifyReply, readSpa } from "./write";
import { freshText, pollInbox } from "./inbox";
import { warmupInbox, warmupTick } from "./warmup-run";
import { newMessageId, sendMail } from "./mailer";
import { inWindow, randomGapMs, startOfPacificDay, timezoneFor } from "./time";
import {
  DEFAULT_SETTINGS, fallbackOpener, fillTags, footer, greetingName, nameKey, nextStep, phoneKey, reachOf, waitDays,
  type Lead, type LeadStatus, type Message, type ReplyClass, type Settings, type Step,
} from "./shared";

const DAY = 86_400_000;
/** "Not now" replies come back up after this many days. */
export const LATER_DAYS = 60;
export const laterDate = (from: number, days = LATER_DAYS) => new Date(from + days * DAY).toISOString().slice(0, 10);
const FREEMAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|msn|comcast|att|sbcglobal)\./;
export const db = () => previewDb();

export async function loadSettings(): Promise<Settings & { imap_uidvalidity: number | null; imap_last_uid: number }> {
  const { data } = await db().from("outreach_settings").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, imap_uidvalidity: null, imap_last_uid: 0, ...(data ?? {}) } as Settings & { imap_uidvalidity: number | null; imap_last_uid: number };
}

export async function loadSteps(): Promise<Step[]> {
  const { data } = await db().from("outreach_steps").select("*").order("step");
  // Anything unknown (or a row from before CP-250b) is an email.
  return ((data ?? []) as Step[]).map((s) => ({ ...s, kind: s.kind === "call" || s.kind === "instagram_dm" ? s.kind : "email" }));
}

export function mergeValues(lead: Pick<Lead, "first_name" | "business_name" | "city">) {
  return { first_name: greetingName(lead), spa_name: lead.business_name, city: lead.city ?? "", preview_link: PREVIEW_LINK, book_link: BOOK_LINK };
}

export async function isSuppressed(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  const { data } = await db().from("outreach_suppressions").select("value").in("value", [e, `@${e.split("@")[1]}`]).limit(1);
  return !!data?.length;
}

export async function suppress(value: string, reason: "unsubscribed" | "bounced" | "not_interested" | "manual" | "client") {
  const v = value.trim().toLowerCase();
  if (v.length < 3) return;
  await db().from("outreach_suppressions").upsert({ value: v, reason }, { onConflict: "value", ignoreDuplicates: true });
}

/** End a lead's sequence: status, no next step, open drafts/approved emails cancelled. */
export async function stopLead(id: string, status: LeadStatus, reason: string | null, extra: Partial<Lead> = {}) {
  const d = db();
  const now = new Date().toISOString();
  await d.from("outreach_leads").update({ status, next_at: null, stopped_reason: reason, updated_at: now, ...extra }).eq("id", id);
  await d.from("outreach_messages").update({ status: "cancelled" }).eq("lead_id", id).in("status", ["draft", "approved"]);
  // Open calls on the To-do list go too (a reply, booking or "no thanks" makes them moot).
  await d.from("outreach_tasks").update({ done_at: now, outcome: "skipped" }).eq("lead_id", id).is("done_at", null);
}

/* ───────────────────────── 3 · read the site and draft email 1 ───────────────────────── */

async function alreadyInFunnel(email: string): Promise<boolean> {
  const d = db();
  const e = email.toLowerCase();
  const [a, b] = await Promise.all([
    d.from("landing_leads").select("id").ilike("email", e).limit(1),
    d.from("app_previews").select("id").ilike("contact_email", e).limit(1),
  ]);
  return !!(a.data?.length || b.data?.length);
}

export async function draftFromTemplate(lead: Lead, step: Step, opener?: string): Promise<{ subject: string; body: string }> {
  const v = { ...mergeValues(lead), opener: opener ?? fallbackOpener(lead) };
  return { subject: fillTags(step.subject, v), body: fillTags(step.body, v) };
}

/**
 * CP-250b · is this spa already in Atlas? A business (client or demo app) with the same name or
 * phone, or a /medspa preview or lead from the same website. Returns what matched, for the reason.
 */
export async function alreadyInAtlas(lead: Pick<Lead, "business_name" | "phone" | "domain">): Promise<string | null> {
  const d = db();
  const key = nameKey(lead.business_name);
  const phone = phoneKey(lead.phone);
  const { data: biz } = await d.from("businesses").select("name, contact_info").limit(2000);
  for (const b of (biz ?? []) as Array<{ name: string | null; contact_info: { phone?: string } | null }>) {
    if ((key.length >= 4 && nameKey(b.name) === key) || (phone && phoneKey(b.contact_info?.phone) === phone)) return `Already in Atlas (${b.name ?? "an app"})`;
  }
  if (lead.domain) {
    const like = `%${lead.domain.replace(/[%_]/g, "")}%`;
    const [a, b] = await Promise.all([
      d.from("app_previews").select("id").ilike("website", like).limit(1),
      d.from("landing_leads").select("id").ilike("website", like).limit(1),
    ]);
    if (a.data?.length || b.data?.length) return "Already made a preview or became a lead on /medspa";
  }
  return null;
}

/**
 * Read the spa's site (if it has one), choose the email, judge fit, then draft email 1 into Review.
 * `redraft` writes a new draft over an existing one (never over an approved or sent email);
 * `note` is a one-off instruction from Redraft ("mention their membership").
 */
export async function enrichLead(id: string, opts: { redraft?: boolean; note?: string | null } = {}): Promise<{ ok: boolean; note: string }> {
  const d = db();
  const { data: lead } = await d.from("outreach_leads").select("*").eq("id", id).maybeSingle<Lead>();
  if (!lead) return { ok: false, note: "Lead not found." };
  const now = new Date().toISOString();

  const existing = await d.from("outreach_messages").select("id, status").eq("lead_id", id).eq("step", 1).maybeSingle();
  if (existing.data && existing.data.status !== "draft") return { ok: true, note: "Email 1 was already approved or sent: nothing to redraft." };
  if (existing.data && !opts.redraft) return { ok: true, note: "Email 1 is already in Review." };

  const inAtlas = await alreadyInAtlas(lead);
  if (inAtlas) {
    await d.from("outreach_leads").update({ enriched_at: now }).eq("id", id);
    await stopLead(id, "stopped", inAtlas);
    return { ok: true, note: `${inAtlas}: not cold-emailing them.` };
  }

  let site: Awaited<ReturnType<typeof readSite>> = null;
  if (lead.website) site = await readSite(lead.website);

  const patch: Partial<Lead> = { enriched_at: now, updated_at: now, error: null };
  if (site) {
    patch.website = site.website;
    patch.emails_found = site.emails;
    patch.site_notes = site.text.slice(0, 2000);
    if (site.domain && !lead.domain) patch.domain = site.domain;
    if (!lead.email && site.best) { patch.email = site.best; patch.email_source = "site"; patch.email_mx_ok = site.mxOk; }
    if (site.blockedNotice) patch.error = "Their site asks not to collect its addresses: add an email only if they gave it to you.";
    if (!lead.instagram && site.instagram) patch.instagram = site.instagram;
  } else if (lead.website) {
    patch.error = "Couldn't read their website.";
  }
  const email = (patch.email ?? lead.email) || null;
  const merged = { ...lead, ...patch } as Lead;

  if (!email) {
    await d.from("outreach_leads").update({ ...patch, status: "no_email" }).eq("id", id);
    return { ok: true, note: "No email on their site. Add one by hand if you have it." };
  }
  if (await isSuppressed(email)) {
    await d.from("outreach_leads").update(patch).eq("id", id);
    await stopLead(id, "stopped", "On the do-not-contact list");
    return { ok: true, note: "That email is on the do-not-contact list." };
  }
  if (await alreadyInFunnel(email)) {
    await d.from("outreach_leads").update(patch).eq("id", id);
    await stopLead(id, "stopped", "Already a lead in the /medspa funnel");
    return { ok: true, note: "Already a lead in the funnel: not cold-emailing them." };
  }

  const steps = await loadSteps();
  const s1 = steps.find((s) => s.step === 1);
  if (!s1) { await d.from("outreach_leads").update(patch).eq("id", id); return { ok: false, note: "Step 1 is missing: apply the CP-250 SQL." }; }

  const settings = await loadSettings();
  const mode = settings.write_mode === "full" ? "full" : "opener";
  const read = s1.ai && site
    ? await readSpa({
        businessName: merged.business_name, city: merged.city, rating: merged.rating, reviews: merged.reviews, siteText: site.text,
        mode, template: s1.body, notes: settings.writing_notes ?? "", note: opts.note,
      })
    : null;
  if (read) {
    patch.fit = read.fit; patch.fit_reason = read.fit_reason || null;
    if (read.ig_dm) patch.ig_dm = read.ig_dm;
    if (read.first_name && !merged.first_name) { patch.first_name = read.first_name; merged.first_name = read.first_name; }
  }

  let subject: string, body: string, ai = false, line: string | null = null;
  if (read && mode === "full" && read.subject && read.body) {
    subject = read.subject;
    body = `Hi ${greetingName(merged)},\n\n${read.body}`;
    ai = true; line = read.opener;
  } else {
    // Opener mode (or a full draft that broke a rule): your template, with Claude's line if we have one.
    ({ subject, body } = await draftFromTemplate(merged, s1, read?.opener ?? undefined));
    if (read?.opener && s1.body.includes("{opener}")) { ai = true; line = read.opener; }
  }
  await d.from("outreach_leads").update({ ...patch, status: "review" }).eq("id", id);
  await d.from("outreach_messages").upsert(
    { lead_id: id, step: 1, subject, body, ai, ai_detail: read?.detail || null, ai_line: line, edited: false, status: "draft", approved_at: null, approved_by: null, error: null },
    { onConflict: "lead_id,step" },
  );
  const fitNote = read ? ` ${read.fit === "good" ? "Good fit" : read.fit === "no" ? "Not a fit" : "Fit unsure"}${read.fit_reason ? `: ${read.fit_reason}` : ""}.` : "";
  const what = ai
    ? (mode === "full" ? "Read their site and drafted email 1." : "Read their site and wrote the opening line.")
    : s1.ai ? "Drafted from the template (the AI couldn't read enough of their site)." : "Drafted from the template.";
  return { ok: true, note: what + fitNote };
}

/* ───────────────────────── 1 · inbox ───────────────────────── */

async function matchLead(item: { from: string | null; inReplyTo: string[]; failedRecipients: string[]; kind: string }): Promise<Lead | null> {
  const d = db();
  if (item.inReplyTo.length) {
    const { data } = await d.from("outreach_messages").select("lead_id").in("message_id", item.inReplyTo.slice(0, 20)).limit(1);
    if (data?.[0]) {
      const { data: l } = await d.from("outreach_leads").select("*").eq("id", data[0].lead_id).maybeSingle<Lead>();
      if (l) return l;
    }
  }
  const candidates = item.kind === "bounce" ? item.failedRecipients : item.from ? [item.from] : [];
  for (const e of candidates) {
    const { data } = await d.from("outreach_leads").select("*").ilike("email", e).limit(1);
    if (data?.[0]) return data[0] as Lead;
  }
  if (item.kind !== "bounce" && item.from) {
    const host = item.from.split("@")[1] ?? "";
    if (host && !FREEMAIL.test(host)) {
      const { data } = await d.from("outreach_leads").select("*").eq("domain", host).limit(1);
      if (data?.[0]) return data[0] as Lead;
    }
  }
  return null;
}

async function runInbox(settings: Awaited<ReturnType<typeof loadSettings>>, out: TickResult) {
  let poll;
  try {
    poll = await pollInbox({ uidvalidity: settings.imap_uidvalidity, lastUid: Number(settings.imap_last_uid ?? 0) });
  } catch (e) {
    out.notes.push(`Inbox: ${e instanceof Error ? e.message.slice(0, 120) : "couldn't connect"}`);
    return;
  }
  if (!poll) return;
  if (poll.note) out.notes.push(poll.note);
  const d = db();
  const me = fromAddress();
  for (const item of poll.items) {
    if (item.from && item.from === me) continue;
    // CP-250e · replies and bounces from warm-up contacts are warm-up, not leads.
    if (await warmupInbox(item)) continue;
    const lead = await matchLead(item);
    if (!lead && item.kind !== "reply") continue; // unrelated bounce/auto mail: not ours to track
    const fresh = freshText(item.text);
    let cls: ReplyClass;
    if (item.kind === "bounce") cls = "bounce";
    else if (item.kind === "auto") cls = "out_of_office";
    else cls = lead ? await classifyReply(item.subject, fresh) : "other";
    const ins = await d.from("outreach_replies").insert({
      lead_id: lead?.id ?? null, mail_uid: item.uid, kind: item.kind, class: cls, from_email: item.from,
      subject: item.subject, body: fresh, received_at: item.date, handled: item.kind !== "reply",
    }).select("id");
    if (ins.error || !lead) continue; // duplicate (already handled) or mail from someone not in the list
    out.inbox++;
    if (cls === "bounce") {
      if (lead.email) await suppress(lead.email, "bounced");
      await stopLead(lead.id, "bounced", "Email bounced");
    } else if (cls === "out_of_office") {
      // Keep the sequence going; just note it.
      await d.from("outreach_leads").update({ reply_class: cls, updated_at: new Date().toISOString() }).eq("id", lead.id);
    } else {
      const status: LeadStatus = cls === "unsubscribe" ? "unsubscribed" : cls === "not_interested" ? "not_interested" : cls === "not_now" ? "later" : "replied";
      if ((cls === "unsubscribe" || cls === "not_interested") && lead.email) await suppress(lead.email, cls === "unsubscribe" ? "unsubscribed" : "not_interested");
      // CP-250b · "not now" goes on the Later list with a re-contact date (change it in the drawer).
      const later = cls === "not_now" ? { recontact_at: laterDate(Date.parse(item.date) || Date.now()) } : {};
      await stopLead(lead.id, status, `Replied (${cls.replace("_", " ")})`, { last_reply_at: item.date, reply_class: cls, ...later });
    }
  }
  await d.from("outreach_settings").update({ imap_uidvalidity: poll.uidvalidity, imap_last_uid: poll.lastUid }).eq("id", 1);
}

/* ───────────────────────── 2 · booked ───────────────────────── */

async function runBooked(out: TickResult) {
  const d = db();
  const { data: leads } = await d.from("outreach_leads").select("id, email").in("status", ["contacted", "done", "replied", "queued", "later"]).not("email", "is", null).limit(500);
  if (!leads?.length) return;
  const byEmail = new Map(leads.map((l) => [String(l.email).toLowerCase(), String(l.id)]));
  const emails = Array.from(byEmail.keys());
  const [a, b] = await Promise.all([
    d.from("landing_demo_requests").select("email").in("email", emails),
    d.from("landing_leads").select("email").in("email", emails),
  ]);
  for (const r of [...(a.data ?? []), ...(b.data ?? [])]) {
    const id = byEmail.get(String(r.email).toLowerCase());
    if (!id) continue;
    byEmail.delete(String(r.email).toLowerCase());
    await stopLead(id, "booked", "Booked a demo or opted in on the site");
    out.booked++;
  }
}

/* ───────────────────────── 4 · next steps ───────────────────────── */

async function runFollowups(settings: Settings, steps: Step[], now: number, out: TickResult) {
  const d = db();
  const { data: due } = await d.from("outreach_leads").select("*").eq("status", "contacted").lte("next_at", new Date(now).toISOString()).limit(50);
  for (const lead of (due ?? []) as Lead[]) {
    const reach = reachOf(lead);
    const next = nextStep(steps, lead.step, reach);
    if (!next) { await d.from("outreach_leads").update({ status: "done", next_at: null }).eq("id", lead.id); continue; }

    if (next.kind === "call" || next.kind === "instagram_dm") {
      // CP-250b/c · a manual step: put it on the To-do list and move the sequence on (it doesn't block
      // the emails). The Instagram DM is the one Claude drafted from their site, else the step's template.
      const v = { ...mergeValues(lead), opener: "" };
      const script = next.kind === "instagram_dm" && lead.ig_dm ? lead.ig_dm : fillTags(next.body, v);
      const { error } = await d.from("outreach_tasks").insert({ lead_id: lead.id, kind: next.kind, step: next.step, script: script.slice(0, 2000), due_at: new Date(now).toISOString() });
      if (error && error.code !== "23505") { out.notes.push(`To-do task: ${error.message.slice(0, 100)}`); continue; }
      const after = nextStep(steps, next.step, reach);
      await d.from("outreach_leads").update({
        step: next.step, status: after ? "contacted" : "done",
        next_at: after ? new Date(now + waitDays(steps, next.step, after) * DAY).toISOString() : null, updated_at: new Date(now).toISOString(),
      }).eq("id", lead.id);
      if (next.kind === "call") out.calls++; else out.dms++;
      continue;
    }

    const have = await d.from("outreach_messages").select("id").eq("lead_id", lead.id).eq("step", next.step).maybeSingle();
    if (have.data) continue;
    const { subject, body } = await draftFromTemplate(lead, next, "");
    await d.from("outreach_messages").insert({
      lead_id: lead.id, step: next.step, subject, body, ai: false,
      status: settings.approve_followups ? "draft" : "approved",
      approved_at: settings.approve_followups ? null : new Date(now).toISOString(),
    });
    out.followups++;
  }
}

/* ───────────────────────── 5 · send ───────────────────────── */

export async function sentSince(iso: string): Promise<number> {
  const { count } = await db().from("outreach_messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", iso);
  return count ?? 0;
}

/** Approved emails whose lead is due, oldest first. */
async function sendable(now: number): Promise<Array<Message & { lead: Lead }>> {
  const d = db();
  const { data: msgs } = await d.from("outreach_messages").select("*").eq("status", "approved").order("approved_at", { ascending: true }).limit(100);
  if (!msgs?.length) return [];
  const ids = Array.from(new Set(msgs.map((m) => m.lead_id)));
  const { data: leads } = await d.from("outreach_leads").select("*").in("id", ids);
  const { data: camps } = await d.from("outreach_campaigns").select("id, paused");
  const paused = new Set((camps ?? []).filter((c) => c.paused).map((c) => c.id));
  const byId = new Map(((leads ?? []) as Lead[]).map((l) => [l.id, l]));
  return (msgs as Message[])
    .map((m) => ({ ...m, lead: byId.get(m.lead_id)! }))
    .filter((m) => {
      const l = m.lead;
      if (!l?.email) return false;
      if (l.campaign_id && paused.has(l.campaign_id)) return false;
      if (l.next_at && Date.parse(l.next_at) > now) return false;
      if (l.status === "queued") return m.step === 1;
      if (l.status === "contacted") return m.step > l.step;
      return false;
    });
}

async function sendOne(m: Message & { lead: Lead }, settings: Settings, steps: Step[], now: number): Promise<{ ok: boolean; note: string }> {
  const d = db();
  const lead = m.lead;
  const to = lead.email!;
  if (await isSuppressed(to)) { await stopLead(lead.id, "stopped", "On the do-not-contact list"); return { ok: false, note: `${lead.business_name}: on the do-not-contact list` }; }

  // Thread follow-ups under email 1.
  let subject = m.subject.trim();
  let inReplyTo: string | null = null;
  if (m.step > 1) {
    const { data: first } = await d.from("outreach_messages").select("subject, message_id").eq("lead_id", lead.id).eq("status", "sent").order("step").limit(1).maybeSingle();
    inReplyTo = first?.message_id ?? null;
    if (!subject && first?.subject) subject = `Re: ${first.subject.replace(/^re:\s*/i, "")}`;
  }
  if (!subject) subject = `${lead.business_name}`;

  // Claim before sending, so two runs can never send the same email.
  const { data: claimed } = await d.from("outreach_messages").update({ status: "sending" }).eq("id", m.id).eq("status", "approved").select("id");
  if (!claimed?.length) return { ok: false, note: "Already being sent." };

  // CP-250d · a link (and its headers) only in opt-out style 'link'; by default the opt-out is a reply.
  const unsub = settings.optout_style === "link" ? unsubscribeUrl(lead.id) : null;
  const text = `${m.body.trim()}\n\n${footer(settings.signature, postalAddress(), unsub)}`;
  const messageId = newMessageId();
  try {
    await sendMail({ to, subject, text, fromName: settings.from_name, inReplyTo, unsubscribeUrl: unsub }, messageId);
  } catch (e) {
    const err = e instanceof Error ? e.message.slice(0, 280) : "Send failed";
    await d.from("outreach_messages").update({ status: "failed", error: err }).eq("id", m.id);
    await d.from("outreach_leads").update({ error: `Send failed: ${err}`.slice(0, 300) }).eq("id", lead.id);
    return { ok: false, note: `${lead.business_name}: ${err}` };
  }
  const sentAt = new Date(now).toISOString();
  await d.from("outreach_messages").update({ status: "sent", sent_at: sentAt, message_id: messageId, subject, error: null }).eq("id", m.id);
  const next = nextStep(steps, m.step, reachOf(lead));
  await d.from("outreach_leads").update({
    step: m.step, status: next ? "contacted" : "done",
    next_at: next ? new Date(now + waitDays(steps, m.step, next) * DAY).toISOString() : null,
    error: null, updated_at: sentAt,
  }).eq("id", lead.id);
  return { ok: true, note: `Sent step ${m.step} to ${lead.business_name}` };
}

async function runSend(settings: Settings, steps: Step[], now: number, out: TickResult, opts: { force?: boolean }) {
  if (settings.paused) { out.notes.push(`Paused${settings.paused_reason ? `: ${settings.paused_reason}` : ""}.`); return; }
  const today = await sentSince(startOfPacificDay(now));
  out.sentToday = today;
  const queue = (await sendable(now)).filter((m) => inWindow(now, m.lead.timezone || timezoneFor(m.lead.state), settings));
  out.ready = queue.length;
  if (!queue.length) return;
  if (today >= settings.daily_cap) { out.notes.push(`Daily cap reached (${today}/${settings.daily_cap}).`); return; }
  if (!sendLive()) { out.wouldSend = Math.min(queue.length, settings.daily_cap - today); out.notes.push("Sending is off (OUTREACH_SEND): nothing went out."); return; }
  if (!opts.force && settings.next_send_after && Date.parse(settings.next_send_after) > now) return;
  const r = await sendOne(queue[0], settings, steps, now);
  out.notes.push(r.note);
  if (r.ok) out.sent++;
  await db().from("outreach_settings").update({ next_send_after: new Date(now + randomGapMs(settings.gap_min_minutes, settings.gap_max_minutes)).toISOString() }).eq("id", 1);
}

async function runGuard(now: number, out: TickResult) {
  const since = new Date(now - 7 * DAY).toISOString();
  const sent = await sentSince(since);
  if (sent < 20) return;
  const { count } = await db().from("outreach_replies").select("id", { count: "exact", head: true }).eq("kind", "bounce").not("lead_id", "is", null).gte("received_at", since);
  const rate = (count ?? 0) / sent;
  if (rate > 0.05) {
    await db().from("outreach_settings").update({ paused: true, paused_reason: `Bounce rate ${(rate * 100).toFixed(1)}% over 7 days. Check the email list before resuming.` }).eq("id", 1);
    out.notes.push("Paused: bounce rate over 5%.");
  }
}

/* ───────────────────────── the run ───────────────────────── */

export type TickResult = { inbox: number; booked: number; read: number; followups: number; calls: number; dms: number; ready: number; sent: number; wouldSend: number; sentToday: number; live: boolean; notes: string[] };

export async function runTick(opts: { force?: boolean; now?: number } = {}): Promise<TickResult> {
  const now = opts.now ?? Date.now();
  const out: TickResult = { inbox: 0, booked: 0, read: 0, followups: 0, calls: 0, dms: 0, ready: 0, sent: 0, wouldSend: 0, sentToday: 0, live: sendLive(), notes: [] };
  const settings = await loadSettings();
  const steps = await loadSteps();
  if (!steps.length) { out.notes.push("No sequence steps: apply the CP-250 SQL."); return out; }

  await runInbox(settings, out);
  await runBooked(out);
  const { data: fresh } = await db().from("outreach_leads").select("id").eq("status", "new").order("created_at").limit(2);
  for (const l of fresh ?? []) { await enrichLead(String(l.id)); out.read++; }
  await runFollowups(settings, steps, now, out);
  try { const w = await warmupTick(settings, now); if (w) out.notes.push(w); }
  catch (e) { out.notes.push(`Warm-up: ${e instanceof Error ? e.message.slice(0, 100) : "failed"}`); }
  await runSend(settings, steps, now, out, opts);
  await runGuard(now, out);

  const note = [
    out.sent ? `sent ${out.sent}` : out.wouldSend ? `would send ${out.wouldSend}` : null,
    out.inbox ? `${out.inbox} new in inbox` : null,
    out.read ? `read ${out.read} site${out.read > 1 ? "s" : ""}` : null,
    out.booked ? `${out.booked} booked` : null,
    out.calls ? `${out.calls} call${out.calls > 1 ? "s" : ""} added to To-do` : null,
    out.dms ? `${out.dms} Instagram DM${out.dms > 1 ? "s" : ""} added to To-do` : null,
    ...out.notes,
  ].filter(Boolean).join(" · ") || "Nothing due.";
  await db().from("outreach_settings").update({ last_tick_at: new Date(now).toISOString(), last_tick_note: note.slice(0, 400) }).eq("id", 1);
  return out;
}
