/**
 * CP-246 · the two apps deploy separately and keep their own copies of a few things. These must not drift:
 *   · the SMS consent wording (carriers check the opt-in text against the A2P registration);
 *   · the Launch Plan call (name, value, takeaways) and its length vs. what the calendar books;
 *   · the launch-bonus window.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as venuesConsent from "../lib/preview/consent";
import * as medspaConsent from "../../medspa/lib/sms-consent";
import { AS_SEEN_AT, JUDGE_REACTIONS, GUARANTEES, LAUNCH_BONUS as V_BONUS, LAUNCH_CALL as V_CALL, TEAM_PROOF as V_TEAM } from "../lib/landing/medspa-funnel";
import { CALL_MINUTES } from "../lib/landing/availability";
import { GUARANTEE_100, LAUNCH_BONUS as M_BONUS, LAUNCH_CALL as M_CALL, MECHANISM, OFFER, TEAM_PROOF as M_TEAM } from "../../medspa/lib/offer";

test("SMS consent wording is identical in both apps", () => {
  assert.equal(medspaConsent.SMS_INFO_CONSENT_TEXT, venuesConsent.SMS_INFO_CONSENT_TEXT);
  assert.equal(medspaConsent.SMS_MARKETING_CONSENT_TEXT, venuesConsent.SMS_MARKETING_CONSENT_TEXT);
});

test("the Launch Plan call matches across apps, and its length is what the calendar books", () => {
  assert.equal(M_CALL.name, V_CALL.name);
  assert.equal(M_CALL.value, V_CALL.value);
  assert.deepEqual(M_CALL.takeaways, V_CALL.takeaways);
  assert.equal(M_CALL.minutes, CALL_MINUTES);
  assert.equal(M_CALL.takeaways.length, 3);
});

test("the launch-bonus window matches across apps", () => {
  assert.equal(M_BONUS.hours, V_BONUS.hours);
  assert.equal(M_BONUS.active, V_BONUS.active);
});

test("CP-257: the proof cards match across apps, stay med spa only, and never say it was built in a weekend", () => {
  assert.deepEqual(M_TEAM, V_TEAM);
  assert.deepEqual(V_TEAM.posts.map((p) => p.id), ["mission", "owner-video", "process"]);
  for (const p of V_TEAM.posts) assert.ok(!!p.youtube !== !!p.file, `${p.id}: exactly one of youtube or file`);
  for (const p of V_TEAM.posts) {
    const text = `${p.title} ${p.body}`;
    assert.doesNotMatch(text, /Atlas (placed|won|finished)|top 10/i);
    assert.doesNotMatch(text, /(in|over) (one|a|1) weekend|in (two|2) days|from scratch/i, `${p.id}: no "built in a weekend" framing`);
    assert.doesNotMatch(text, /Flippo|arcade|batting/i, `${p.id}: med spa pages only`);
    assert.doesNotMatch(text, /scan/i, `${p.id}: the app is the star, not the face scan`);
  }
});

test("the mechanism makes no recall-sending claim (not Live in the messaging library)", () => {
  const text = MECHANISM.steps.map((s) => `${s.t} ${s.d}`).join(" ");
  assert.doesNotMatch(text, /comes? due, (your app|we|it) sends?/i);
});

test("CP-264: the bonus total on the booking page is the sum of the bonuses the preview shows", () => {
  assert.equal(V_BONUS.total, M_BONUS.bonuses.reduce((a, b) => a + b.value, 0));
});

test("CP-264: the guarantee lines match across apps, and the 100-patient one leads with its conditions in the fine print", () => {
  assert.deepEqual(OFFER.guarantees, GUARANTEES.map((g) => g.short));
  const g = GUARANTEES[0];
  assert.equal(g.id, "users100");
  assert.match(g.short, /^100 patients on your app in 90 days/);
  assert.match(g.fine, /Atlas dashboard/);
  assert.match(g.fine, /300 patient visits/);
  assert.ok(GUARANTEES.some((x) => x.id === "pays"), "the pays-for-itself guarantee is still offered");
});

test("CP-265: the preview page's guarantee wording is the venue site's, word for word", () => {
  assert.equal(GUARANTEE_100.body, GUARANTEES[0].body);
  assert.equal(GUARANTEE_100.fine, GUARANTEES[0].fine);
  assert.match(GUARANTEE_100.line, /^100 of your patients on your app within 90 days/);
});

test("CP-277: the hackathon copy claims no prize or ranking, and judge videos go up only once approved", () => {
  const text = JSON.stringify(AS_SEEN_AT);
  assert.doesNotMatch(text, /(won|winner|finalist|placed|place|prize|award|top \d+)/i);
  assert.equal(AS_SEEN_AT.recapUrl, "https://cpvc-hackathon-recap.vercel.app/");
  for (const v of JUDGE_REACTIONS.videos) {
    assert.ok(v.approved, `${v.youtube}: approved by the judge in writing before it goes in`);
    assert.ok(v.quote.trim() && v.name.trim() && v.role.trim(), `${v.youtube}: quote, name and role`);
    assert.doesNotMatch(`${v.quote} ${v.role}`, /(won|winner|finalist|prize|award)/i);
  }
});
