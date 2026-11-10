/**
 * lib/preview-event.ts — lead-magnet audit, step 7 · events only the browser sees (app on screen,
 * test push tapped, desk video played), sent to the venue site's /api/preview/event. Fire and forget:
 * never blocks or breaks the page. Each one counts once per page load.
 */
export type ClientPreviewEvent = "app_rendered" | "notif_previewed" | "vsl_played";

const sent = new Set<string>();

export function previewEvent(apiOrigin: string, slug: string, event: ClientPreviewEvent): void {
  const k = `${slug}:${event}`;
  if (sent.has(k)) return;
  sent.add(k);
  try {
    fetch(`${apiOrigin}/api/preview/event`, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, event }) }).catch(() => {});
  } catch { /* never break the page */ }
}
