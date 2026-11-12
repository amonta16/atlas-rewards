/**
 * lib/preview-event.ts — lead-magnet audit, step 7 · events only the browser sees (app on screen,
 * test push tapped, desk video played), sent to the venue site's /api/preview/event. Never blocks or
 * breaks the page. Each one counts once per page load; callers share the one request.
 *
 * CP-245: app_rendered answers { bonus_deadline } (the launch-bonus clock), so its reply is
 * returned to whoever asks; the other events reply 204 (null).
 */
export type ClientPreviewEvent = "app_rendered" | "notif_previewed" | "vsl_played";

const sent = new Map<string, Promise<Record<string, unknown> | null>>();

export function previewEvent(apiOrigin: string, slug: string, event: ClientPreviewEvent): Promise<Record<string, unknown> | null> {
  const k = `${slug}:${event}`;
  const had = sent.get(k);
  if (had) return had;
  let p: Promise<Record<string, unknown> | null>;
  try {
    p = fetch(`${apiOrigin}/api/preview/event`, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, event }) })
      .then((r) => (r.status === 200 ? (r.json() as Promise<Record<string, unknown>>) : null))
      .catch(() => null);
  } catch { p = Promise.resolve(null); }
  sent.set(k, p);
  return p;
}
