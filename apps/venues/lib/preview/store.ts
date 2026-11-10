/**
 * lib/preview/store.ts — CP-232 · app_previews rows, slugs and URLs (server only).
 */
import { randomBytes, createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PreviewColors } from "./colors";
import type { PreviewTreatment } from "./treatments";

let cachedDb: SupabaseClient | null = null;

/**
 * Service-role client for app_previews whose requests are never cached.
 * Next.js caches server fetch() GETs, and supabase-js reads with GET, so a plain
 * client could keep returning an old row ("building" forever). Server only.
 */
export function previewDb(): SupabaseClient {
  if (cachedDb) return cachedDb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL).");
  cachedDb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return cachedDb;
}

export const PREVIEW_TTL_DAYS = 14;
/** A build still "building" after this long is finished with fallbacks by the status poll (CP-233: deep builds take 1–2 min). */
export const STALE_BUILD_MS = 210_000;

export type PreviewRow = {
  id: string; slug: string; place_id: string | null; business_name: string; address: string | null;
  lat: number | null; lng: number | null; phone: string | null; website: string | null;
  logo_url: string | null; logo_is_monogram: boolean; colors: PreviewColors | Record<string, never>;
  treatments: PreviewTreatment[]; treatments_are_examples: boolean; source: "manual" | "auto";
  status: "building" | "ready" | "failed" | "claimed"; build_error: string | null; built_at: string | null;
  area_open: boolean | null; area_zip: string | null; expires_at: string; created_at: string; updated_at: string;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null;
  fbp: string | null; fbc: string | null;
  // CP-233
  contact_name: string | null; contact_phone: string | null; contact_email: string | null; contact_at: string | null;
  hero_url: string | null; font_family: string | null; about: string | null; team: PreviewTeamMember[];
  // CP-234
  booking_system: string | null; offered: string[]; challenges: string[]; priorities: string[];
  quiz_at: string | null; phone_verified_at: string | null; landing_lead_id: string | null;
};

export type PreviewTeamMember = { name: string; title: string; photo_url: string | null };

export const SLUG_RE = /^pv-[a-z0-9-]{3,64}$/;

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** "Glow Aesthetics" → "pv-glow-aesthetics-k3x9q2". The random tail makes slugs unguessable. */
export function newPreviewSlug(name: string): string {
  const base = slugify(name) || "spa";
  const tail = randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(6, "x").slice(0, 6);
  return `pv-${base}-${tail}`;
}

export function medspaOrigin(): string {
  const host = (process.env.NEXT_PUBLIC_MEDSPA_HOST ?? "med.atlas-engine.app").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
}

export function previewUrl(slug: string): string {
  return `${medspaOrigin()}/p/${slug}`;
}

/** CP-237: the preview's front desk (opens in preview mode, no sign-in; nothing is saved). */
export function deskUrl(slug: string): string {
  return `${medspaOrigin()}/${slug}/desk`;
}

export function expiresAt(from = Date.now()): string {
  return new Date(from + PREVIEW_TTL_DAYS * 86_400_000).toISOString();
}

export function isExpired(row: Pick<PreviewRow, "expires_at">): boolean {
  return new Date(row.expires_at).getTime() <= Date.now();
}

/** Salted hash of the caller's IP (never stored raw). */
export function hashIpString(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.LANDING_LINK_SECRET || process.env.CRON_SECRET || "atlas";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

export async function getPreviewBySlug(slug: string): Promise<PreviewRow | null> {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await previewDb().from("app_previews").select("*").eq("slug", slug).maybeSingle();
  return (data as PreviewRow | null) ?? null;
}

export async function getPreviewByPlace(placeId: string): Promise<PreviewRow | null> {
  const { data } = await previewDb().from("app_previews").select("*").eq("place_id", placeId).maybeSingle();
  return (data as PreviewRow | null) ?? null;
}

/** Uploads a normalized PNG logo to the public business-logos bucket. Returns its public URL. */
export async function uploadLogo(slug: string, png: Buffer): Promise<string | null> {
  const db = previewDb();
  const path = `previews/${slug}-${randomBytes(4).toString("hex")}.png`;
  const { error } = await db.storage.from("business-logos").upload(path, png, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[preview] logo upload failed", error.message);
    return null;
  }
  return db.storage.from("business-logos").getPublicUrl(path).data.publicUrl ?? null;
}

/** CP-233: uploads one of the spa's re-encoded photos. Returns its public URL. */
export async function uploadPhoto(slug: string, jpeg: Buffer, kind: string): Promise<string | null> {
  const db = previewDb();
  const path = `previews/${slug}/${kind}-${randomBytes(5).toString("hex")}.jpg`;
  const { error } = await db.storage.from("business-logos").upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[preview] photo upload failed", error.message);
    return null;
  }
  return db.storage.from("business-logos").getPublicUrl(path).data.publicUrl ?? null;
}
