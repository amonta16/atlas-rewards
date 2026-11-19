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
