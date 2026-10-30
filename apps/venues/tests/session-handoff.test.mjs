/**
 * tests/session-handoff.test.mjs — CP-211
 *
 * The middleware → render session handoff must never be a way in:
 * forged, tampered, expired, replayed-into-another-session or unsigned
 * values all verify to null (→ the render falls back to a real Auth check).
 * Run with:  npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_HANDOFF_SECRET = "test-secret-do-not-use";
const { signHandoff, verifyHandoff, authCookieHash } = await import("../lib/supabase/session-handoff.ts");

const user = { id: "11111111-1111-1111-1111-111111111111", email: "a@b.co", aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {}, created_at: "2026-01-01T00:00:00Z", identities: [{ big: "x".repeat(500) }] };
const cookies = [{ name: "sb-abc-auth-token", value: "session-A" }, { name: "theme", value: "dark" }];

test("a fresh, signed handoff for this session verifies to the same user (identities dropped)", async () => {
  const h = await authCookieHash(cookies);
  const v = await signHandoff(user, h);
  const u = await verifyHandoff(v, h);
  assert.equal(u?.id, user.id);
  assert.equal(u?.email, user.email);
  assert.equal("identities" in u, false);
});

test("forged / garbage / empty values never verify", async () => {
  const h = await authCookieHash(cookies);
  for (const v of [null, "", "abc", "abc.def", "eyJ1Ijp7ImlkIjoieCJ9fQ.AAAA", "....."]) {
    assert.equal(await verifyHandoff(v, h), null, String(v));
  }
});

test("tampering with the payload breaks the signature", async () => {
  const h = await authCookieHash(cookies);
  const v = await signHandoff(user, h);
  const [body, sig] = v.split(".");
  const evil = Buffer.from(JSON.stringify({ u: { ...user, id: "attacker" }, c: h, t: Date.now() })).toString("base64url");
  assert.equal(await verifyHandoff(`${evil}.${sig}`, h), null);
  assert.equal(await verifyHandoff(`${body}.${sig.slice(0, -2)}xx`, h), null);
});

test("a handoff from one session can't be used with another session's cookie", async () => {
  const v = await signHandoff(user, await authCookieHash(cookies));
  const other = await authCookieHash([{ name: "sb-abc-auth-token", value: "session-B" }]);
  assert.equal(await verifyHandoff(v, other), null);
  assert.equal(await verifyHandoff(v, await authCookieHash([])), null);
});

test("a signature from a different secret is rejected", async () => {
  const h = await authCookieHash(cookies);
  process.env.SESSION_HANDOFF_SECRET = "other-secret";
  const v = await signHandoff(user, h);
  process.env.SESSION_HANDOFF_SECRET = "test-secret-do-not-use";
  assert.equal(await verifyHandoff(v, h), null);
});

test("expired handoffs (older than 30 s) are rejected", async () => {
  const h = await authCookieHash(cookies);
  const realNow = Date.now;
  Date.now = () => realNow() - 31_000;
  const v = await signHandoff(user, h);
  Date.now = realNow;
  assert.equal(await verifyHandoff(v, h), null);
});

test("no secret configured → nothing is signed and nothing verifies (old behaviour)", async () => {
  const h = await authCookieHash(cookies);
  const v = await signHandoff(user, h);
  const saved = { a: process.env.SESSION_HANDOFF_SECRET, b: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SESSION_HANDOFF_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(await signHandoff(user, h), null);
  assert.equal(await verifyHandoff(v, h), null);
  process.env.SESSION_HANDOFF_SECRET = saved.a;
});
