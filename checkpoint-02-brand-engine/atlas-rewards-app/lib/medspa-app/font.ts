/**
 * Med spa app typeface — CP-193. Hanken Grotesk (variable), self-hosted via
 * @fontsource-variable/hanken-grotesk + next/font/local, so builds never
 * depend on Google Fonts. Loaded only by the med spa frame
 * (components/medspa-app/frame.tsx); no other layout downloads it.
 */
import localFont from "next/font/local";

export const hanken = localFont({
  src: "../../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-ms",
});

export const msFontClass = `${hanken.variable} font-[family-name:var(--font-ms)]`;
