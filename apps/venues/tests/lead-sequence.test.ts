/**
 * Lead-magnet audit, step 6 · the follow-up sequence's rules (lib/landing/lead-sequence.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SEQUENCE, planStep, smsSegments, whenLabel, type LeadState } from "../lib/landing/lead-sequence";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 10, 17, 0);
const base: LeadState = { optedInAt: T0, next: 0, email: true, smsOk: true, smsStopped: false, callPhone: true, stoppedReason: null };
const at = (minutes: number) => T0 + minutes * MIN;

test("the schedule is the audit's: 0:45 text, 3 h email, 5 h call, 24 h text, day 2 email, day 3 call, day 4 text, day 6 email, day 8 break-up, day 14", () => {
  assert.deepEqual(DEFAULT_SEQUENCE.map((s) => [whenLabel(s.delay_minutes), s.channel]), [
    ["0:45", "sms"], ["3 h", "email"], ["5 h", "call"], ["24 h", "sms"], ["day 2", "email"],
    ["day 3", "call"], ["day 4", "sms"], ["day 6", "email"], ["day 8", "email"], ["day 14", "email"],
  ]);
  for (const s of DEFAULT_SEQUENCE) if (s.channel === "sms") assert.match(s.body, /Reply STOP to opt out\.$/);
});

test("the SQL seed matches the code's schedule (step, channel, timing)", () => {
  const sql = readFileSync(new URL("../../../db/history/checkpoint-243-lead-sequence/cp243_lead_sequence.sql", import.meta.url), "utf8");
  const seeded = [...sql.matchAll(/^\((\d+), '(sms|email|call)', '[^']*', (\d+),/gm)].map((m) => [Number(m[1]), m[2], Number(m[3])]);
  assert.deepEqual(seeded, DEFAULT_SEQUENCE.map((s) => [s.step, s.channel, s.delay_minutes]));
  // …and the copy is word for word the same ("Starting copy" in the admin = a fresh install)
  const sqlText = (t: string) => t.replace(/'/g, "''").replace(/\n/g, "\\n");
  for (const s of DEFAULT_SEQUENCE) {
    assert.ok(sql.includes(`E'${sqlText(s.body)}'`), `step ${s.step} body differs from the SQL seed`);
    if (s.subject) assert.ok(sql.includes(`'${sqlText(s.subject)}'`), `step ${s.step} subject differs`);
    if (s.preheader) assert.ok(sql.includes(`'${sqlText(s.preheader)}'`), `step ${s.step} preheader differs`);
  }
});

test("nothing before 0:45; at 0:45 the first text sends", () => {
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, base, at(44)), { kind: "wait" });
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, base, at(45)), { kind: "do", index: 0, passed: [], action: "send" });
});

test("a call step becomes a task; without any phone it's skipped", () => {
  assert.equal((planStep(DEFAULT_SEQUENCE, { ...base, next: 2 }, at(300)) as { action: string }).action, "task");
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, { ...base, next: 2, callPhone: false }, at(300)), { kind: "do", index: 2, passed: [], action: "skip", reason: "no phone number to call" });
});

test("texts need SMS consent, and stop for good once they reply", () => {
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, { ...base, smsOk: false }, at(45)), { kind: "do", index: 0, passed: [], action: "skip", reason: "no SMS consent on file" });
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, { ...base, next: 3, smsStopped: true }, at(1440)), { kind: "do", index: 3, passed: [], action: "skip", reason: "texts stopped: they replied or opted out" });
  // a reply stops texts only: the day 2 email still goes
  assert.equal((planStep(DEFAULT_SEQUENCE, { ...base, next: 4, smsStopped: true }, at(2880)) as { action: string }).action, "send");
});

test("emails skip when unsubscribed", () => {
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, { ...base, next: 1, email: false }, at(180)), { kind: "do", index: 1, passed: [], action: "skip", reason: "no email, or unsubscribed" });
});

test("behind schedule: only the latest due step acts, the rest are passed over (no burst)", () => {
  // day 2 and 3 h passed while the cron was off: steps 0..4 due → only index 4 (day 2 email) sends
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, base, at(2 * 1440 + 5)), { kind: "do", index: 4, passed: [0, 1, 2, 3], action: "send" });
});

test("switched-off steps are passed over; if every due step is off, the last one is logged as off", () => {
  const off = DEFAULT_SEQUENCE.map((s) => (s.step === 2 ? { ...s, enabled: false } : s));
  assert.deepEqual(planStep(off, { ...base, next: 1 }, at(180)), { kind: "do", index: 1, passed: [], action: "skip", reason: "switched off" });
  assert.deepEqual(planStep(off, base, at(200)), { kind: "do", index: 0, passed: [1], action: "send" });
});

test("booked (or paid) stops everything; a finished sequence waits", () => {
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, { ...base, stoppedReason: "booked" }, at(300)), { kind: "stop", reason: "booked" });
  assert.deepEqual(planStep(DEFAULT_SEQUENCE, { ...base, next: DEFAULT_SEQUENCE.length }, at(30 * 1440)), { kind: "wait" });
});

test("smsSegments: 160 GSM characters is one text, emoji switch to 70", () => {
  assert.deepEqual(smsSegments("a".repeat(160)), { chars: 160, unicode: false, segments: 1 });
  assert.deepEqual(smsSegments("a".repeat(161)), { chars: 161, unicode: false, segments: 2 });
  assert.equal(smsSegments("Hi 👋 there").unicode, true);
});
