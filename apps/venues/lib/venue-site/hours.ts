import type { HoursRow } from "./content";

/** "20:00" → "8", "10:30" → "10:30" */
export function to12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const hr = ((h + 11) % 12) + 1;
  return m ? `${hr}:${String(m).padStart(2, "0")}` : `${hr}`;
}
export function ampm(hhmm: string) { return Number(hhmm.split(":")[0]) >= 12 ? "pm" : "am"; }

/** "10am – 8pm", "11am – 9pm" */
export function hoursLine(r: HoursRow) {
  return `${to12(r.open)}${ampm(r.open) === ampm(r.close) ? "" : ampm(r.open)} – ${to12(r.close)}${ampm(r.close)}`;
}
