/**
 * lib/preview/events.ts — lead-magnet audit, step 7 · the lead magnet's events (server only).
 *
 * One row per preview per event (public.preview_events, CP-244), so every rate is "previews that did
 * X", never inflated by reloads. recordEvent() never throws and never slows a response for long:
 * before CP-244 is applied it logs once and does nothing.
 *
 * The headline number: render-to-book = previews with book_clicked ÷ previews with app_rendered.
 * Under RENDER_TO_BOOK_RED (3%) is a red alert on the product, not the copy.
 */
import { previewDb } from "./store";

export const PREVIEW_EVENTS = [
  "build_started", "app_rendered", "brand_overridden", "notif_previewed", "gate_submitted",
  "portal_login", "vsl_played", "csv_imported", "app_installed", "book_clicked",
] as const;
export type PreviewEvent = (typeof PREVIEW_EVENTS)[number];

/** Events the browser may report itself (POST /api/preview/event). The rest are recorded on the server. */
export const CLIENT_EVENTS: readonly PreviewEvent[] = ["app_rendered", "notif_previewed", "vsl_played"];

export const EVENT_LABEL: Record<PreviewEvent, string> = {
  build_started: "Build started", app_rendered: "App on screen", brand_overridden: "Fixed logo or color",
  notif_previewed: "Tried the test push", gate_submitted: "Unlocked (email + zip)", portal_login: "Opened the front desk",
  vsl_played: "Played the desk video", csv_imported: "Imported patients", app_installed: "Installed the app",
  book_clicked: "Clicked Book",
};

export const RENDER_TO_BOOK_RED = 0.03;
/** Below this many renders the rate is shown but not judged. */
export const MIN_RENDERS_TO_JUDGE = 20;

let missingLogged = false;

export async function recordEvent(previewId: string, event: PreviewEvent, meta: Record<string, string | number | boolean | null> = {}): Promise<void> {
  try {
    const { error } = await previewDb().rpc("record_preview_event", { p_preview: previewId, p_event: event, p_meta: meta });
    if (error) {
      if (/record_preview_event|preview_events/.test(error.message) && missingLogged) return;
      missingLogged = true;
      console.error("[events] record failed (is CP-244 applied?)", event, error.message);
    }
  } catch (e) {
    console.error("[events] record failed", event, e instanceof Error ? e.message : e);
  }
}

export type RenderToBook = { renders: number; booked: number; rate: number | null; state: "red" | "ok" | "too_few" };

export function renderToBook(renders: number, booked: number): RenderToBook {
  const rate = renders ? booked / renders : null;
  const state = renders < MIN_RENDERS_TO_JUDGE ? "too_few" : (rate ?? 0) < RENDER_TO_BOOK_RED ? "red" : "ok";
  return { renders, booked, rate, state };
}
