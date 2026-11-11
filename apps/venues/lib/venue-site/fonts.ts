/**
 * Venue website typefaces, self-hosted.
 *   Bricolage Grotesque: display. Chunky, playful, a little quirky. It's
 *                        also what Flippo's old WordPress site used, so the
 *                        brand carries over.
 *   Figtree:             body and UI. Round and friendly, very legible small.
 */
import localFont from "next/font/local";

export const bricolage = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-vs-display",
});

export const figtree = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-vs-body",
});

export const venueSiteFontClass = `${bricolage.variable} ${figtree.variable}`;
