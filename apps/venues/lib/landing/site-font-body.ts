/**
 * CP-251 · the brand site's body face on its own (Manrope, one variable file, ~25 KB).
 * The funnel pages (/medspa/app, /medspa/start, /medspa/book, /medspa/confirm, the SMS consent page)
 * import this instead of site-fonts.ts: next/font preloads every face a route's modules declare, and
 * none of those pages use the display serif (Instrument Serif, two files, ~43 KB), which only the
 * home page's client-results marks use.
 */
import localFont from "next/font/local";

export const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-site-body",
});

export const siteBodyFontClass = manrope.variable;
