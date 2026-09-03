/**
 * demo-folders.ts — CP-129 (auto-file demos: city → niche)
 *
 * Every demo built with an address lands in the Apps deck as
 * "<City>" ▸ "<Niche>" (the CP-128.2 one-level nesting), so a door week
 * self-organizes into e.g. "Morro Bay" ▸ "Smoke & vape" with zero filing.
 * Folders are found case-insensitively and created on demand. Everything
 * here is best-effort — a folder hiccup never blocks a demo build.
 */
import { createClient } from "@/lib/supabase/client";

type Supa = ReturnType<typeof createClient>;

/** "123 Main St, Morro Bay, CA 93442, USA" → "Morro Bay". Best-effort. */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const city = parts[parts.length - 3];
  // Guard against oddly-shaped addresses ("CA 93442" is not a city).
  if (!city || /\d/.test(city) || city.length > 40) return null;
  return city;
}

async function ensureFolder(
  supabase: Supa,
  name: string,
  parentId: string | null,
): Promise<string | null> {
  let query = supabase.from("business_folders").select("id").ilike("name", name).limit(1);
  query = parentId === null
    ? query.is("parent_folder_id", null)
    : query.eq("parent_folder_id", parentId);
  const { data: found } = await query;
  if (found?.length) return found[0].id as string;
  const { data: created, error } = await supabase
    .from("business_folders")
    .insert({ name, parent_folder_id: parentId })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id as string;
}

/** File a freshly built demo into "<city>" ▸ "<nicheLabel>". Best-effort. */
export async function fileDemoIntoFolders(
  supabase: Supa,
  businessId: string,
  city: string,
  nicheLabel: string,
): Promise<void> {
  try {
    const parentId = await ensureFolder(supabase, city, null);
    if (!parentId) return;
    const childId = await ensureFolder(supabase, nicheLabel, parentId);
    if (!childId) return;
    await supabase.from("businesses").update({ folder_id: childId }).eq("id", businessId);
  } catch {
    /* never block a demo build over filing */
  }
}
