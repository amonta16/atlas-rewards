/**
 * lib/landing/territory.ts — CP-204 · "Is your area still open?" (server only)
 *
 * One med spa per area. An area is TERRITORY.radiusMiles (or a row's own
 * radius_miles) around a client's zip. Open = no active row in
 * medspa_territories within that distance of the visitor's zip.
 * Never returns which practice holds an area. Import only from server code (API routes).
 *
 * Zip coordinates: lib/data/us-zips.json, built from the `zipcodes` package
 * (MIT); its coordinates come from GeoNames (geonames.org), licensed CC BY 4.0.
 */
import ZIPS from "@/lib/data/us-zips.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { FOUNDING, TERRITORY } from "./medspa-funnel";

type ZipRow = [number, number, string, string];
const Z = ZIPS as unknown as Record<string, ZipRow>;

export function lookupZip(zip: string): { zip: string; lat: number; lng: number; city: string; state: string } | null {
  const z = (zip ?? "").trim().slice(0, 5);
  const r = /^\d{5}$/.test(z) ? Z[z] : undefined;
  return r ? { zip: z, lat: r[0], lng: r[1], city: r[2], state: r[3] } : null;
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type AreaCheck =
  | { ok: false; error: string }
  | { ok: true; zip: string; city: string; state: string; open: boolean; radiusMiles: number; founding: { active: boolean; spotsLeft: number; spots: number; setupFull: number; setupFounding: number } };

export async function checkArea(zipInput: string): Promise<AreaCheck> {
  const at = lookupZip(zipInput);
  if (!at) return { ok: false, error: "We couldn't find that zip code. Please check it and try again." };
  const db = createAdminClient();
  const { data, error } = await db.from("medspa_territories").select("lat, lng, radius_miles, founding").eq("active", true).limit(5000);
  if (error) throw error;
  const rows = data ?? [];
  const open = !rows.some((t) => milesBetween(at, { lat: Number(t.lat), lng: Number(t.lng) }) <= Number(t.radius_miles ?? TERRITORY.radiusMiles));
  const used = rows.filter((t) => t.founding).length;
  return {
    ok: true, zip: at.zip, city: at.city, state: at.state, open, radiusMiles: TERRITORY.radiusMiles,
    founding: { active: FOUNDING.active && used < FOUNDING.spots, spotsLeft: Math.max(0, FOUNDING.spots - used), spots: FOUNDING.spots, setupFull: FOUNDING.setupFull, setupFounding: FOUNDING.setupFounding },
  };
}
