/**
 * Brand-site typefaces — CP-187. Self-hosted like the /medspa pair.
 *   Instrument Serif — display. A tall, high-contrast transitional with a real
 *                      italic: reads "clinic letterhead", not fashion Didone.
 *   Manrope          — body and UI. Even, slightly wide sans; crisp at 15px.
 */
import localFont from "next/font/local";

export const instrumentSerif = localFont({
  src: [
    { path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-site-display",
});

// CP-251: Manrope is declared once, in site-font-body.ts (the funnel pages import only that file).
import { manrope } from "./site-font-body";
export { manrope };

export const siteFontClass = `${instrumentSerif.variable} ${manrope.variable}`;
