import type { Config } from "tailwindcss";

/**
 * Atlas Med Spa look: near-white page, white cards, ink-black buttons,
 * black-and-white photography. The clinic's brand color (--p) is the one
 * accent (active tab, badges, links).
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F5F6F5",
        ink: "#171B26",
        sub: "#6E7380",
        faint: "#A3A7B0",
        line: "#E6E8EA",
        tint: "#EEF1F7",
        brand: "rgb(var(--p-rgb) / <alpha-value>)",
      },
      fontFamily: { sans: ["var(--font-hanken)", "system-ui", "sans-serif"] },
      borderRadius: { card: "18px" },
      boxShadow: {
        card: "0 1px 2px rgba(23,27,38,0.04), 0 8px 24px -16px rgba(23,27,38,0.18)",
        bar: "0 -10px 30px -18px rgba(23,27,38,0.25)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        sheet: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        rise: "rise .35s cubic-bezier(.2,.7,.2,1) both",
        sheet: "sheet .32s cubic-bezier(.2,.8,.2,1) both",
        fade: "fade .2s ease both",
      },
    },
  },
  plugins: [],
} satisfies Config;
