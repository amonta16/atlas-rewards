// Where does Atlas Engine point to? Configure your deployed PWA root here.
// Local dev: lvh.me:3000 won't resolve on a real phone — use your laptop's
// IP address (run `ipconfig` on Windows, `ifconfig` on Mac/Linux) instead,
// or tunnel via ngrok.
// Production: set ROOT_HOST to your real domain (e.g., "atlasrewards.app").

import Constants from "expo-constants";

const fromEnv = Constants.expoConfig?.extra?.ATLAS_ROOT_HOST;

// Default to production; override via expo `extra` config or env if needed.
export const ROOT_HOST: string = fromEnv ?? "atlasrewards.app";
export const ROOT_PROTOCOL: "http" | "https" = ROOT_HOST.includes("lvh.me") ? "http" : "https";

export function urlForBusiness(slug: string, path: string = "/app"): string {
  const port = ROOT_HOST.includes("lvh.me") ? ":3000" : "";
  return `${ROOT_PROTOCOL}://${slug}.${ROOT_HOST}${port}${path}`;
}

// Supabase project URL — same as your Next.js .env.local NEXT_PUBLIC_SUPABASE_URL.
// We use it for the public "look up business by slug" API call from the native app.
export const SUPABASE_URL  = Constants.expoConfig?.extra?.SUPABASE_URL  ?? "";
export const SUPABASE_ANON = Constants.expoConfig?.extra?.SUPABASE_ANON ?? "";
