/**
 * /medspa typefaces — CP-183. Self-hosted (fontsource + next/font/local) so
 * builds never depend on Google Fonts. Only the /medspa route loads them.
 *   Fraunces  — display. A soft, "wonky" old-style serif with an optical-size
 *               axis: warm and clinical-luxe without the usual fashion Didone.
 *   Figtree   — body and UI. Friendly geometric sans that stays legible small.
 */
import localFont from "next/font/local";

export const fraunces = localFont({
  src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-ms-display",
});

export const figtree = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-ms-body",
});

export const medspaFontClass = `${fraunces.variable} ${figtree.variable}`;
