/**
 * tests/machine-secret.test.mjs — CP-109
 *
 * Verifies the machine-auth gate that protects every cron/webhook-facing
 * notification route (process-pending, push-fanout, raffles/sweep) stays
 * FAIL-CLOSED. Run with:  npm test   (= node --test tests/)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { safeEqual, machineSecret, hasMachineSecret, requireMachineSecret } =
  require("../lib/machine-secret.js");

const req = (headers = {}) => ({
  headers: { get: (n) => headers[n.toLowerCase()] ?? null },
});

test("no CRON_SECRET configured → gate fails CLOSED with 503", () => {
  for (const env of [{}, { CRON_SECRET: "" }, { CRON_SECRET: "   " }]) {
    const r = requireMachineSecret(req({ authorization: "Bearer anything" }), env);
    assert.equal(r.ok, false);
    assert.equal(r.status, 503);
  }
});

test("wrong or missing credential → 401, never ok", () => {
  const env = { CRON_SECRET: "s3cret-value" };
  for (const h of [
    {},
    { authorization: "Bearer wrong" },
    { authorization: "Bearer s3cret-valu" },          // near-miss / truncation
    { authorization: "s3cret-value" },                 // missing Bearer prefix
    { "x-atlas-secret": "wrong" },
    { "x-atlas-secret": "" },
  ]) {
    const r = requireMachineSecret(req(h), env);
    assert.equal(r.ok, false, `should reject headers ${JSON.stringify(h)}`);
    assert.equal(r.status, 401);
  }
});

test("correct credential accepted via either header", () => {
  const env = { CRON_SECRET: "s3cret-value" };
  assert.equal(requireMachineSecret(req({ authorization: "Bearer s3cret-value" }), env).ok, true);
  assert.equal(requireMachineSecret(req({ "x-atlas-secret": "s3cret-value" }), env).ok, true);
  // Vercel-style padding survives the trim.
  assert.equal(requireMachineSecret(req({ authorization: "  Bearer s3cret-value  " }), env).ok, true);
});

test("an empty x-atlas-secret can never match an empty comparison", () => {
  // Regression guard: ''-vs-'' must not be treated as a match anywhere.
  assert.equal(hasMachineSecret(req({ "x-atlas-secret": "" }), { CRON_SECRET: "x" }), false);
  assert.equal(machineSecret({ CRON_SECRET: "" }), null);
});

test("safeEqual: equality semantics with no length leaks beyond boolean", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
  assert.equal(safeEqual("", ""), true);
});
