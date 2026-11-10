import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient as createServer } from "@/lib/supabase/server";
import { previewDb } from "@/lib/preview/store";
import { REVIEW_BUCKET, isPlacement, type ReviewImageRow, type ReviewPlacement } from "@/lib/landing/review-images";

/**
 * /api/agency/site-reviews — CP-240 · Admin → Reviews (agency_admin only).
 *   GET                                                   → every review image, in order
 *   POST  { action: "sign", files: [{ name, type }] }     → signed upload URLs (browser uploads straight to storage)
 *   POST  { action: "add", items: [{ path, width, height, show_on }] } → saves uploaded images as reviews
 *   PATCH { id, active?, alt?, show_on? }                 → edits one
 *   PATCH { order: [id, …] }                              → saves the order
 *   DELETE { id }                                         → removes the row and the file
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const COLS = "id, storage_path, url, width, height, alt, show_on, active, sort_order, created_at";
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const PATH_RE = /^r\/[a-z0-9-]{8,80}\.(png|jpg|webp|gif|avif)$/;
const NO_TABLE = "Couldn't reach the reviews table. Has the CP-240 SQL been applied?";

async function admin(): Promise<string | null> {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await server.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  return data?.length ? user.id : null;
}

const placements = (v: unknown): ReviewPlacement[] | null => {
  if (!Array.isArray(v)) return null;
  const out = Array.from(new Set(v.filter(isPlacement)));
  return out.length ? out : null;
};
const dim = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n < 20000 ? n : null; };
const deny = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

export async function GET() {
  if (!(await admin())) return deny();
  const { data, error } = await previewDb().from("site_review_images").select(COLS).order("sort_order").order("created_at");
  if (error) return NextResponse.json({ error: NO_TABLE, images: [] }, { status: 500 });
  return NextResponse.json({ images: (data ?? []) as ReviewImageRow[] });
}

export async function POST(req: Request) {
  const me = await admin();
  if (!me) return deny();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = previewDb();

  if (b.action === "sign") {
    const files = Array.isArray(b.files) ? (b.files as { type?: unknown }[]).slice(0, 40) : [];
    if (!files.length) return NextResponse.json({ error: "No files." }, { status: 400 });
    const out: { path: string; token: string }[] = [];
    for (const f of files) {
      const ext = TYPES[String(f.type ?? "")];
      if (!ext) return NextResponse.json({ error: "Images only: PNG, JPG, WebP, GIF or AVIF." }, { status: 400 });
      const path = `r/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
      const { data, error } = await db.storage.from(REVIEW_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return NextResponse.json({ error: `Storage said no: ${error?.message ?? "unknown"}. Has the CP-240 SQL (bucket) been applied?` }, { status: 500 });
      out.push({ path, token: data.token });
    }
    return NextResponse.json({ uploads: out });
  }

  if (b.action === "add") {
    const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]).slice(0, 40) : [];
    const { data: last } = await db.from("site_review_images").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    let order = ((last ?? [])[0] as { sort_order: number } | undefined)?.sort_order ?? 0;
    const rows = items
      .filter((i) => typeof i.path === "string" && PATH_RE.test(i.path))
      .map((i) => ({
        storage_path: i.path as string,
        url: db.storage.from(REVIEW_BUCKET).getPublicUrl(i.path as string).data.publicUrl,
        width: dim(i.width), height: dim(i.height),
        alt: typeof i.alt === "string" ? i.alt.slice(0, 200) : "",
        show_on: placements(i.show_on) ?? ["medspa", "general"],
        sort_order: (order += 10), created_by: me,
      }));
    if (!rows.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    const { data, error } = await db.from("site_review_images").insert(rows).select(COLS);
    if (error) return NextResponse.json({ error: `${NO_TABLE} (${error.message})` }, { status: 500 });
    return NextResponse.json({ images: data });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function PATCH(req: Request) {
  if (!(await admin())) return deny();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = previewDb();

  if (Array.isArray(b.order)) {
    const ids = (b.order as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200);
    const results = await Promise.all(ids.map((id, i) => db.from("site_review_images").update({ sort_order: (i + 1) * 10 }).eq("id", id)));
    const bad = results.find((r) => r.error);
    return bad ? NextResponse.json({ error: bad.error!.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  if (typeof b.id !== "string") return NextResponse.json({ error: "Which review?" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof b.active === "boolean") patch.active = b.active;
  if (typeof b.alt === "string") patch.alt = b.alt.slice(0, 200);
  if ("show_on" in b) {
    const p = placements(b.show_on);
    if (!p) return NextResponse.json({ error: "Pick at least one page to show it on." }, { status: 400 });
    patch.show_on = p;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { data, error } = await db.from("site_review_images").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ image: data });
}

export async function DELETE(req: Request) {
  if (!(await admin())) return deny();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.id !== "string") return NextResponse.json({ error: "Which review?" }, { status: 400 });
  const db = previewDb();
  const { data: row } = await db.from("site_review_images").select("storage_path").eq("id", b.id).maybeSingle();
  const { error } = await db.from("site_review_images").delete().eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const path = (row as { storage_path?: string } | null)?.storage_path;
  if (path) await db.storage.from(REVIEW_BUCKET).remove([path]).catch(() => null);
  return NextResponse.json({ ok: true });
}
