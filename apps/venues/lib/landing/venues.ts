/**
 * Venue photos for the landing page — CP-176.
 *
 * Two sources, merged:
 *   1. BASE — Pexels photos already in our Supabase image library (arcade,
 *      bowling, VR, racing sims, parties). Live today.
 *   2. venue-photos.json — written by `node scripts/fetch-landing-photos.mjs`
 *      (go-karts, batting cages, mini golf, trampoline parks, golf sims…).
 *      Downloads into public/landing/venues/. Any key in the JSON replaces the
 *      BASE photo with the same key; new keys are added.
 *
 * Pexels license: free for commercial use, no attribution required — we
 * keep the credit anyway (shown on hover / in alt text).
 */
import fetched from "./venue-photos.json";
import { LIB } from "./live-app-data";

export type VenuePhoto = { key: string; label: string; src: string; credit?: string };

const BASE: VenuePhoto[] = [
  { key: "arcade", label: "Arcades", src: LIB.arcadeRow, credit: "Jonathan Cooper · Pexels" },
  { key: "parties", label: "Birthday parties", src: LIB.party, credit: "Gustavo Fring · Pexels" },
  { key: "bowling", label: "Bowling", src: LIB.bowling, credit: "Anastasia Shuraeva · Pexels" },
  { key: "vr", label: "VR & sims", src: LIB.vr, credit: "Mikhail Nilov · Pexels" },
  { key: "claw", label: "Prize counters", src: LIB.claw, credit: "Kenneth Surillo · Pexels" },
  { key: "racing", label: "Racing games", src: LIB.racing, credit: "cottonbro studio · Pexels" },
  { key: "airhockey", label: "Game rooms", src: LIB.airHockey, credit: "Anastasia Shuraeva · Pexels" },
];

/** Display order — keys missing a photo are skipped. */
const ORDER = ["arcade", "cages", "karts", "parties", "bowling", "minigolf", "trampoline", "golfsim", "vr", "claw", "racing", "airhockey", "laser"];

type Fetched = Record<string, { label: string; src: string; credit?: string }>;

export function venuePhotos(): VenuePhoto[] {
  const map = new Map<string, VenuePhoto>(BASE.map((p) => [p.key, p]));
  for (const [key, v] of Object.entries(fetched as Fetched)) map.set(key, { key, ...v });
  const ordered = ORDER.map((k) => map.get(k)).filter(Boolean) as VenuePhoto[];
  const rest = [...map.values()].filter((p) => !ORDER.includes(p.key));
  return [...ordered, ...rest];
}
