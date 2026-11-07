/**
 * lib/preview/store.ts — CP-232 · app_previews rows, slugs and URLs (server only).
 */
import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewColors } from "./colors";
import type { PreviewTreatment } from "./treatments";

export const PREVIEW_TTL_DAYS = 14;
/** A build still "building" after this long is finished with fallbacks by the status poll. */
export const STALE_BUILD_MS = 75_000;

export type PreviewRow = {
  id: string; slug: string; place_id: string | null; business_name: string; address: string | null;
  lat: number | null; lng: number | null; phone: string | null; website: string | null;
  logo_url: string | null; logo_is_monogram: boolean; colors: PreviewColors | Record<string, never>;
  treatments: PreviewTreatment[]; treatments_are_examples: boolean; source: "manual" | "auto";
  status: "building" | "ready" | "failed" | "claimed"; build_error: string | null;
  area_open: boolean | null; area_zip: string | null; expires_at: string; created_at: string; updated_at: string;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null;
};

export const SLUG_RE = /^pv-[a-z0-9-]{3,64}$/;

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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
  const { data } = await createAdminClient().from("app_previews").select("*").eq("slug", slug).maybeSingle();
  return (data as PreviewRow | null) ?? null;
}

export async function getPreviewByPlace(placeId: string): Promise<PreviewRow | null> {
  const { data } = await createAdminClient().from("app_previews").select("*").eq("place_id", placeId).maybeSingle();
  return (data as PreviewRow | null) ?? null;
}

/** Uploads a normalized PNG logo to the public business-logos bucket. Returns its public URL. */
export async function uploadLogo(slug: string, png: Buffer): Promise<string | null> {
  const db = createAdminClient();
  const path = `previews/${slug}-${randomBytes(4).toString("hex")}.png`;
  const { error } = await db.storage.from("business-logos").upload(path, png, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[preview] logo upload failed", error.message);
    return null;
  }
  return db.storage.from("business-logos").getPublicUrl(path).data.publicUrl ?? null;
}
