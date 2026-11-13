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
import { LAUNCH_BONUS as V_BONUS, LAUNCH_CALL as V_CALL } from "../lib/landing/medspa-funnel";
import { CALL_MINUTES } from "../lib/landing/availability";
import { LAUNCH_BONUS as M_BONUS, LAUNCH_CALL as M_CALL } from "../../medspa/lib/offer";

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
