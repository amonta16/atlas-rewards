/**
 * Hanken Grotesk (variable), self-hosted — CP-193/194. One definition shared by
 * the med spa app (lib/medspa-app/font.ts) and the site's client-results band.
 */
import localFont from "next/font/local";

export const hanken = localFont({
  src: "../../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-hanken",
});
