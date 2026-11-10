import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { notifyLead } from "@/lib/landing/notify";
import { getPreviewBySlug, isExpired, medspaOrigin, previewDb, previewUrl, progressOf, SLUG_RE } from "@/lib/preview/store";
import { checkVerifyToken } from "@/lib/preview/verify-link";

/**
 * POST /api/preview/progress — lead-magnet audit, step 4 · what the owner has done on their preview.
 *
 * Body { slug, event, count?, token? }
 *   desk_visit     first visit to the preview desk (sets desk_first_at once)
 *   verified       opened the desk from our email's signed link (token checked against the row's email)
 *   csv_imported   imported their patient list on the desk (count only: the list stays in their browser)
 *   app_installed  opened their preview app from a phone's Home Screen
 * → { ok, progress: { verified, csv, installed } }
 *
 * Each time is set once and never cleared. "Turn it on now" on the desk needs all three of
 * verified, csv and installed. Columns from CP-242: until that migration is applied this answers
 * 503 and the desk keeps the button hidden. CORS: the med spa origin only. Rate limited.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EVENTS = { desk_visit: "desk_first_at", verified: "verified_at", csv_imported: "csv_imported_at", app_installed: "app_installed_at" } as const;
type Event = keyof typeof EVENTS;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = medspaOrigin();
  return origin === allowed
    ? { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const h = cors(req);
  const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { ...h, "Cache-Control": "no-store" } });
  const rl = await rateLimit(clientKey(req, "pv-progress"), 30, 600);
  if (!rl.ok) return reply(429, { error: "Too many requests." });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const slug = typeof b.slug === "string" ? b.slug.toLowerCase() : "";
  const event = typeof b.event === "string" && b.event in EVENTS ? (b.event as Event) : null;
  if (!SLUG_RE.test(slug) || !event) return reply(400, { error: "Invalid request." });

  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row) || (row.status !== "ready" && row.status !== "claimed")) return reply(404, { error: "Preview not found." });
  const col = EVENTS[event];
  if (!(col in row)) return reply(503, { error: "Not available yet." }); // CP-242 not applied
  if (event === "verified" && !checkVerifyToken(slug, row.contact_email, typeof b.token === "string" ? b.token : null)) return reply(403, { error: "That link didn't check out." });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};
  if (!row[col]) update[col] = now;
  if (event === "csv_imported") {
    const n = Number(b.count);
    if (Number.isFinite(n) && n >= 0) update.csv_count = Math.min(Math.round(n), 1_000_000);
  }
  if (Object.keys(update).length) {
    const { error } = await previewDb().from("app_previews").update(update).eq("id", row.id);
    if (error) { console.error("[preview] progress save failed", slug, event, error.message); return reply(500, { error: "Couldn't save." }); }
  }
  const next = { ...row, ...update };

  // Tell Andrew the moments that matter, once each.
  if (update[col] && event !== "desk_visit") {
    const what = event === "verified" ? "opened the desk from the email" : event === "csv_imported" ? `imported ${update.csv_count ?? "?"} patients` : "installed the app on a phone";
    await notifyLead(`Preview progress: ${row.business_name} ${what}`, [
      ["Practice", row.business_name],
      ["Verified", next.verified_at ? "yes" : "no"],
      ["Patients imported", next.csv_imported_at ? String(next.csv_count ?? "yes") : "no"],
      ["App installed", next.app_installed_at ? "yes" : "no"],
      ["Preview", previewUrl(row.slug)],
    ]).catch(() => false);
  }
  return reply(200, { ok: true, progress: progressOf(next) });
}
