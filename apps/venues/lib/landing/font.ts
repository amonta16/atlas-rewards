/**
 * Landing typeface — CP-100. Inter (variable), self-hosted via
 * @fontsource-variable/inter + next/font/local so builds never depend on
 * Google Fonts being reachable. Only the landing + /book-demo pages load it;
 * the customer/agency apps are untouched.
 */
import localFont from "next/font/local";

export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});

export const interClass = `${inter.variable} font-[family-name:var(--font-inter)]`;
