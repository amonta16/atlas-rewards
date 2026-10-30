import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // These CSS variables are set per-business at runtime in app/[business]/layout.tsx
        brand: {
          primary:   "hsl(var(--brand-primary) / <alpha-value>)",
          secondary: "hsl(var(--brand-secondary) / <alpha-value>)",
          accent:    "hsl(var(--brand-accent) / <alpha-value>)",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card:       "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted:      "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
