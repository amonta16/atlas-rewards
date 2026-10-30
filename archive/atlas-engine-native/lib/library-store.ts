// Atlas Engine — Library persistence (saved businesses on this device)
// Stored in AsyncStorage. No server-side account in v1.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_URL, SUPABASE_ANON } from "./config";
import type { SavedBusiness } from "./types";

const STORAGE_KEY = "atlas_engine_library_v1";

export async function listSaved(): Promise<SavedBusiness[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as SavedBusiness[]; }
  catch { return []; }
}

export async function saveBusiness(b: Omit<SavedBusiness, "added_at" | "last_opened_at">): Promise<SavedBusiness[]> {
  const existing = await listSaved();
  const filtered = existing.filter(x => x.id !== b.id);
  const now = new Date().toISOString();
  const next: SavedBusiness = { ...b, added_at: now, last_opened_at: now };
  const updated = [next, ...filtered];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeBusiness(id: string): Promise<SavedBusiness[]> {
  const existing = await listSaved();
  const updated = existing.filter(x => x.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function markOpened(id: string): Promise<void> {
  const existing = await listSaved();
  const updated = existing.map(x => x.id === id ? { ...x, last_opened_at: new Date().toISOString() } : x);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

// =====================================================================
// Backend lookup: resolve a slug to a business (via the public RPC we built in CP 1)
// =====================================================================
export async function lookupBusinessBySlug(slug: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error("Supabase credentials not configured in app.json -> extra");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_business_by_slug`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_slug: slug.toLowerCase() }),
  });
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
  const rows = await res.json();
  return rows?.[0] ?? null;
}

// =====================================================================
// Browse all active businesses (for the Discover tab)
// =====================================================================
export async function browseBusinesses() {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/businesses?status=eq.active&select=id,slug,name,industry,logo_url,brand_colors&order=name.asc`,
    {
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` },
    }
  );
  if (!res.ok) return [];
  return (await res.json()) ?? [];
}
