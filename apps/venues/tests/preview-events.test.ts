/**
 * Lead-magnet audit, step 7 · the events and the render-to-book alert (lib/preview/events.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIENT_EVENTS, PREVIEW_EVENTS, RENDER_TO_BOOK_RED, renderToBook } from "../lib/preview/events";

test("the ten events from the brief, and the SQL check constraint allows exactly those", () => {
  assert.deepEqual([...PREVIEW_EVENTS], ["build_started", "app_rendered", "brand_overridden", "notif_previewed", "gate_submitted", "portal_login", "vsl_played", "csv_imported", "app_installed", "book_clicked"]);
  const sql = readFileSync(new URL("../../../db/history/checkpoint-244-preview-events/cp244_preview_events.sql", import.meta.url), "utf8");
  const allowed = [...(sql.match(/event in \(([^)]*)\)/s)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(allowed, [...PREVIEW_EVENTS]);
});

test("the browser may only report what only the browser can see", () => {
  assert.deepEqual([...CLIENT_EVENTS].sort(), ["app_rendered", "notif_previewed", "vsl_played"]);
});

test("render-to-book: red under 3% once there are 20+ renders; too few to judge below that", () => {
  assert.equal(RENDER_TO_BOOK_RED, 0.03);
  assert.deepEqual(renderToBook(100, 2), { renders: 100, booked: 2, rate: 0.02, state: "red" });
  assert.deepEqual(renderToBook(100, 3), { renders: 100, booked: 3, rate: 0.03, state: "ok" });
  assert.equal(renderToBook(19, 0).state, "too_few");
  assert.equal(renderToBook(20, 0).state, "red");
  assert.deepEqual(renderToBook(0, 0), { renders: 0, booked: 0, rate: null, state: "too_few" });
});
