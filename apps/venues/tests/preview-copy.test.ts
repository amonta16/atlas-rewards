/**
 * Lead-magnet audit, step 5 · copy rules that are easy to break later:
 *   · email 2's money math uses THEIR average ticket (median of their menu prices), never a vague claim;
 *   · the default sequence has one ask per email (one link) and no "or reply" stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { avgTicket, DEFAULT_STEPS, DEFAULT_TICKET_CENTS, dollars, fill, SAMPLE_VALUES } from "../lib/landing/lead-nurture";

test("avgTicket: median of their real prices, to the nearest $5", () => {
  const menu = [{ price_cents: 15_000 }, { price_cents: 42_000 }, { price_cents: 65_000 }, { price_cents: 120_000 }];
  assert.deepEqual(avgTicket(menu), { cents: 53_500, fromMenu: true }); // (420 + 650) / 2 = 535
  assert.deepEqual(avgTicket([{ price_cents: 19_900 }, { price_cents: 34_900 }, { price_cents: 89_900 }]), { cents: 35_000, fromMenu: true });
});

test("avgTicket: ignores $0, tiny and absurd prices; falls back when the menu is thin or an example", () => {
  assert.deepEqual(avgTicket([{ price_cents: 0 }, { price_cents: 100 }, { price_cents: 50_000 }, { price_cents: null }]), { cents: DEFAULT_TICKET_CENTS, fromMenu: false });
  assert.deepEqual(avgTicket([{ price_cents: 30_000 }, { price_cents: 40_000 }, { price_cents: 50_000 }], true), { cents: DEFAULT_TICKET_CENTS, fromMenu: false });
  assert.deepEqual(avgTicket(null), { cents: DEFAULT_TICKET_CENTS, fromMenu: false });
  assert.equal(avgTicket([{ price_cents: 30_000 }, { price_cents: 40_000 }, { price_cents: 99_999_999 }]).fromMenu, false);
});

test("email 2 carries the ticket math, filled from merge tags", () => {
  const e2 = DEFAULT_STEPS.find((s) => s.step === 2)!;
  assert.match(e2.body, /\{avg_ticket\}/);
  assert.match(e2.body, /\{ten_rebooks\}/);
  const out = fill(e2.body, { ...SAMPLE_VALUES, avg_ticket: dollars(53_500), ten_rebooks: dollars(535_000) });
  assert.match(out, /about \$535\. If I bring back just 10 patients a month who were due, that's \$5,350\./);
  assert.doesNotMatch(out, /\{[a-z_]+\}/);
});

test("every default email has exactly one link and no 'reply' ask", () => {
  for (const s of DEFAULT_STEPS) {
    const links = s.body.match(/\{(app_link|desk_link|walkthrough_link)\}/g) ?? [];
    assert.equal(links.length, 1, `email ${s.step} has ${links.length} links`);
    assert.doesNotMatch(s.body, /\breply\b/i, `email ${s.step} asks for a reply`);
  }
});
