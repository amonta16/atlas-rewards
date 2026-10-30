"use client";
/**
 * hq-data.ts — CP-111
 *
 * Tiny CRUD helpers shared by the HQ / Revenue Analytics widgets.
 * All writes go straight to Supabase and are authorized by RLS
 * (is_agency_admin()) — the browser never gets to skip the server check.
 *
 * `guardedUpdate` implements optimistic concurrency: the UPDATE only
 * matches when the row's updated_at still equals the value the editor
 * loaded. If another admin saved in between, we return {conflict:true}
 * and the caller reloads instead of silently overwriting their edit.
 */
import { createClient } from "@/lib/supabase/client";

export type SaveResult<T> =
  | { row: T; conflict?: false; error?: undefined }
  | { row?: undefined; conflict: true; error?: undefined }
  | { row?: undefined; conflict?: false; error: string };

export async function insertRow<T>(table: string, values: Record<string, unknown>): Promise<SaveResult<T>> {
  const supabase = createClient();
  const { data, error } = await supabase.from(table).insert(values).select().single();
  if (error) return { error: error.message };
  return { row: data as T };
}

export async function guardedUpdate<T>(
  table: string,
  id: string,
  loadedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<SaveResult<T>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("updated_at", loadedUpdatedAt)
    .select();
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { conflict: true };
  return { row: data[0] as T };
}

export async function deleteRow(table: string, id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  return error ? { error: error.message } : {};
}

export async function reloadRows<T>(table: string, orderBy: { column: string; ascending: boolean }[]): Promise<T[] | null> {
  const supabase = createClient();
  let q = supabase.from(table).select("*");
  for (const o of orderBy) q = q.order(o.column, { ascending: o.ascending });
  const { data, error } = await q;
  if (error) return null;
  return (data ?? []) as T[];
}

/** Fire-and-forget: refresh today's revenue snapshot after pipeline edits. */
export function refreshRevenueSnapshot() {
  const supabase = createClient();
  supabase.rpc("record_agency_revenue_snapshot").then(() => {}, () => {});
}
