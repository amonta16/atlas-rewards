/**
 * CP-250 · Outreach v1: the pure pieces (email finding, ranking, time windows, merge tags, CSV, reply text).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emailsIn, rankEmails } from "../lib/outreach/enrich";
import { inWindow, localParts, startOfPacificDay, timezoneFor } from "../lib/outreach/time";
import { fillTags, footer, greetingName, hostOf, parseCsv } from "../lib/outreach/shared";
import { freshText } from "../lib/outreach/inbox";

test("emailsIn finds mailto, plain text and Cloudflare-protected addresses, and drops junk", () => {
  // "info@glow.com" XOR-encoded with key 0x42, as Cloudflare's email protection writes it.
  const plain = "info@glow.com";
  const key = 0x42;
  const hex = key.toString(16).padStart(2, "0") + Array.from(plain, (c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
  const html = `
    <a href="mailto:Hello@GlowSpa.com?subject=Hi">Email us</a>
    <p>Owner: jane.doe@glowspa.com.</p>
    <span class="__cf_email__" data-cfemail="${hex}">[email protected]</span>
    <img src="logo@2x.png"> noreply@glowspa.com you@example.com hi@sentry.wixpress.com`;
  const found = emailsIn(html).sort();
  assert.deepEqual(found, ["hello@glowspa.com", "info@glow.com", "jane.doe@glowspa.com"].sort());
});

test("rankEmails puts the spa's own domain and role addresses first", () => {
  const ranked = rankEmails(["someone@gmail.com", "random123@glowspa.com", "info@glowspa.com", "jane@glowspa.com"], "glowspa.com");
  assert.equal(ranked[0], "info@glowspa.com");
  assert.equal(ranked[ranked.length - 1], "someone@gmail.com");
});

test("timezoneFor maps states, unknown stays Pacific", () => {
  assert.equal(timezoneFor("CA"), "America/Los_Angeles");
  assert.equal(timezoneFor("AZ"), "America/Phoenix");
  assert.equal(timezoneFor("Texas"), "America/Chicago");
  assert.equal(timezoneFor("NY"), "America/New_York");
  assert.equal(timezoneFor(null), "America/Los_Angeles");
});

test("inWindow uses the lead's local day and hour", () => {
  const s = { send_days: [1, 2, 3, 4, 5], window_start: 8, window_end: 16 };
  const tueNoonPacific = Date.UTC(2026, 10, 17, 20, 0); // Tue Nov 17 2026, 12:00 PST
  assert.equal(inWindow(tueNoonPacific, "America/Los_Angeles", s), true);
  assert.equal(inWindow(tueNoonPacific, "America/New_York", s), true);      // 15:00 ET
  assert.equal(inWindow(tueNoonPacific + 2 * 3600_000, "America/New_York", s), false); // 17:00 ET
  const sat = Date.UTC(2026, 10, 21, 18, 0);
  assert.equal(inWindow(sat, "America/Los_Angeles", s), false);
});

test("startOfPacificDay is local midnight in winter and summer", () => {
  const winter = startOfPacificDay(Date.UTC(2026, 10, 18, 20, 0));
  assert.equal(winter, "2026-11-18T08:00:00.000Z");
  const summer = startOfPacificDay(Date.UTC(2026, 6, 4, 20, 0));
  assert.equal(summer, "2026-07-04T07:00:00.000Z");
  assert.equal(localParts(Date.parse(summer), "America/Los_Angeles").hour, 0);
});

test("merge tags, greeting and footer", () => {
  const v = { first_name: greetingName({ first_name: null, business_name: "Glow" }), spa_name: "Glow", city: "Fresno", preview_link: "P", book_link: "B" };
  assert.equal(fillTags("Hi {first_name}, {spa_name} in {city}: {preview_link} {book_link} {unknown}", v), "Hi there, Glow in Fresno: P B {unknown}");
  const f = footer("Andrew", "123 Main St, Bakersfield, CA", "https://x/u");
  assert.match(f, /123 Main St/);
  assert.match(f, /no thanks/);
  assert.match(f, /https:\/\/x\/u/);
  assert.match(footer("Andrew", null, "u"), /postal address missing/);
});

test("hostOf strips www and handles bare domains", () => {
  assert.equal(hostOf("https://www.GlowSpa.com/about"), "glowspa.com");
  assert.equal(hostOf("glowspa.com"), "glowspa.com");
  assert.equal(hostOf(""), null);
});

test("parseCsv handles quotes, commas, BOM and blank lines", () => {
  const rows = parseCsv("﻿Business Name,Email,City\n\"Glow, Inc\",hi@glow.com,Fresno\n\n\"Say \"\"hi\"\"\",,\"Clovis\"\r\n");
  assert.deepEqual(rows, [
    { business_name: "Glow, Inc", email: "hi@glow.com", city: "Fresno" },
    { business_name: 'Say "hi"', email: "", city: "Clovis" },
  ]);
});

test("freshText keeps the reply and drops the quoted thread", () => {
  const t = "Sure, send it over!\n\nOn Tue, Nov 17, 2026 at 9:02 AM Andrew <a@b.com> wrote:\n> Hi Jane\n> ...";
  assert.equal(freshText(t), "Sure, send it over!");
});

/* ───────── CP-250b · upgrades after the Origami walkthrough ───────── */
import { fallbackOpener, instagramHandle, nameKey, nextStep, phoneKey, waitDays, type Step, type StepKind } from "../lib/outreach/shared";
import { instagramIn } from "../lib/outreach/enrich";

const step = (n: number, kind: StepKind = "email", enabled = true): Step =>
  ({ step: n, name: `s${n}`, delay_days: 2, subject: "", body: "x", ai: false, enabled, kind });
const all = { phone: true, instagram: true };

test("nextStep skips disabled steps, call steps without a phone, Instagram steps without a handle", () => {
  const steps = [step(5), step(1), step(4, "call"), step(3), step(2, "instagram_dm")];
  assert.equal(nextStep(steps, 1, all)?.step, 2);
  assert.equal(nextStep(steps, 1, { phone: true, instagram: false })?.step, 3);
  assert.equal(nextStep(steps, 3, all)?.step, 4);
  assert.equal(nextStep(steps, 3, { phone: false, instagram: true })?.step, 5);
  assert.equal(nextStep(steps, 5, all), null);
  assert.equal(nextStep([step(1), step(2, "email", false), step(3)], 1, all)?.step, 3);
});

test("waitDays keeps a skipped step's place in the calendar and ignores turned-off steps", () => {
  const d = (n: number, kind: StepKind, delay: number, enabled = true): Step => ({ ...step(n, kind, enabled), delay_days: delay });
  // email d0 → IG +2 → email +1 → call +2 → email +2  (days 0, 2, 3, 5, 7)
  const seq = [d(1, "email", 0), d(2, "instagram_dm", 2), d(3, "email", 1), d(4, "call", 2), d(5, "email", 2)];
  const noIg = { phone: true, instagram: false };
  assert.equal(waitDays(seq, 1, nextStep(seq, 1, all)!), 2);       // IG on day 2
  assert.equal(waitDays(seq, 1, nextStep(seq, 1, noIg)!), 3);      // no Instagram: email 2 still on day 3
  assert.equal(waitDays(seq, 3, nextStep(seq, 3, { phone: false, instagram: true })!), 4); // no phone: last note day 7
  const off = [d(1, "email", 0), d(2, "instagram_dm", 2, false), d(3, "email", 1)];
  assert.equal(waitDays(off, 1, nextStep(off, 1, all)!), 1);       // turned off: as if it weren't there
});

/* ───────── CP-250c · the manual Instagram step ───────── */
test("instagramHandle reads @handles, bare handles and profile links, and refuses non-profiles", () => {
  assert.equal(instagramHandle("@Glow.Spa"), "glow.spa");
  assert.equal(instagramHandle("glow_medspa"), "glow_medspa");
  assert.equal(instagramHandle("https://www.instagram.com/GlowMedSpa/?hl=en"), "glowmedspa");
  assert.equal(instagramHandle("instagram.com/glowmedspa"), "glowmedspa");
  assert.equal(instagramHandle("https://instagr.am/glowmedspa"), "glowmedspa");
  assert.equal(instagramHandle("https://www.instagram.com/p/C1abcDEF/"), null);
  assert.equal(instagramHandle("https://www.instagram.com/reel/xyz"), null);
  assert.equal(instagramHandle("https://facebook.com/glow"), null);
  assert.equal(instagramHandle("not a handle!"), null);
  assert.equal(instagramHandle(""), null);
});

test("instagramIn finds the spa's profile among the links on its page, most-linked first", () => {
  const html = `
    <a href="https://www.instagram.com/glowmedspa/">IG</a>
    <a href="//instagram.com/glowmedspa?igsh=abc">Follow us</a>
    <a href="https://www.instagram.com/p/C1abc/">A post</a>
    <a href="https://instagram.com/somepartner">Partner</a>
    <a href="https://facebook.com/glow">FB</a>`;
  assert.deepEqual(instagramIn(html), ["glowmedspa", "somepartner"]);
});

test("the {opener} tag: Claude's line, the honest fallback, or nothing without a hole", () => {
  const tpl = "Hi {first_name},\n\n{opener}\n\nI build branded patient apps for {spa_name}.";
  const v = { first_name: "Jane", spa_name: "Glow", city: "Fresno", preview_link: "P", book_link: "B" };
  assert.equal(fillTags(tpl, { ...v, opener: "Saw your membership." }), "Hi Jane,\n\nSaw your membership.\n\nI build branded patient apps for Glow.");
  assert.equal(fillTags(tpl, { ...v, opener: "" }), "Hi Jane,\n\nI build branded patient apps for Glow.");
  assert.equal(fallbackOpener({ business_name: "Glow", city: "Fresno" }), "I came across Glow while looking at med spas in Fresno.");
  assert.equal(fallbackOpener({ business_name: "Glow", city: null }), "I came across Glow and wanted to reach out.");
});

test("already-in-Atlas keys: names without punctuation, last 10 phone digits", () => {
  assert.equal(nameKey("Glow Med Spa & Wellness, LLC"), "glowmedspaandwellnessllc");
  assert.equal(nameKey("GLOW med-spa and wellness llc"), "glowmedspaandwellnessllc");
  assert.equal(phoneKey("+1 (661) 555-0123"), "6615550123");
  assert.equal(phoneKey("661-555-0123"), "6615550123");
  assert.equal(phoneKey("555-0123"), null);
});

/* ───────── CP-250d · opt-out style: reply only (default) or reply + link ───────── */
import { DEFAULT_SETTINGS } from "../lib/outreach/shared";
import { unsubscribeHeaders } from "../lib/outreach/mailer";
import { classifyReply } from "../lib/outreach/write";

test("reply-only footer: no link, keeps the postal address; link style keeps today's line", () => {
  assert.equal(DEFAULT_SETTINGS.optout_style, "reply");
  const reply = footer("Andrew", "123 Main St, Bakersfield, CA", null);
  assert.match(reply, /123 Main St/);
  assert.match(reply, /Just reply "no thanks" and I won't email again\.$/);
  assert.doesNotMatch(reply, /https?:|link/);
  const link = footer("Andrew", "123 Main St, Bakersfield, CA", "https://x/u");
  assert.match(link, /123 Main St/);
  assert.match(link, /use this link and I won't email again: https:\/\/x\/u$/);
  assert.match(footer("Andrew", null, null), /postal address missing/);
});

test("List-Unsubscribe headers only go on emails that carry a link", () => {
  assert.deepEqual(unsubscribeHeaders(null, "a@b.com"), {});
  assert.deepEqual(unsubscribeHeaders(undefined, "a@b.com"), {});
  assert.deepEqual(unsubscribeHeaders("https://x/u", "a@b.com"), {
    "List-Unsubscribe": "<https://x/u>, <mailto:a@b.com?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

test("reply opt-outs are caught by the rules, no AI needed: no thanks, unsubscribe, stop", async () => {
  assert.equal(await classifyReply("Re: quick question", "No thanks"), "not_interested");
  assert.equal(await classifyReply("Re: quick question", "not interested, we're all set"), "not_interested");
  assert.equal(await classifyReply("Re: quick question", "Please unsubscribe me"), "unsubscribe");
  assert.equal(await classifyReply("Re: quick question", "STOP"), "unsubscribe");
  assert.equal(await classifyReply("Re: quick question", "please stop."), "unsubscribe");
  assert.equal(await classifyReply("Unsubscribe", ""), "unsubscribe");
});
