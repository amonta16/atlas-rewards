import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient as createServer } from "@/lib/supabase/server";
import { previewDb } from "@/lib/preview/store";
import { CASE_BUCKET, CASE_PATH_RE, isResultUse, youtubeId, type CaseStat, type CaseStudyRow } from "@/lib/landing/case-studies";

/**
 * /api/agency/site-results — CP-275 · Admin → Reviews & Results → Results (agency_admin only).
 *   GET                                             → every case study, in order
 *   POST  { action: "sign", type }                  → one signed upload URL for a photo or logo (c/…)
 *   POST  { action: "add" }                         → a new, hidden, empty case study
 *   PATCH { id, clinic?, headline?, stats?, uses?, photo_path?, logo_path?, youtube?, active? } → edits one
 *   PATCH { order: [id, …] }                        → saves the order
 *   DELETE { id }                                   → removes the row and its files
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const COLS = "id, clinic, headline, stats, uses, photo_path, photo_url, logo_path, logo_url, youtube, active, sort_order, created_at";
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const NO_TABLE = "Couldn't reach the results table. Has the CP-275 SQL been applied?";
const deny = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

async function admin(): Promise<string | null> {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await server.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  return data?.length ? user.id : null;
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);
function stats(v: unknown): CaseStat[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.slice(0, 3).map((s) => ({ value: text((s as CaseStat)?.value, 16) ?? "", label: text((s as CaseStat)?.label, 60) ?? "" }));
}

export async function GET() {
  if (!(await admin())) return deny();
  const { data, error } = await previewDb().from("site_case_studies").select(COLS).order("sort_order").order("created_at");
  if (error) return NextResponse.json({ error: NO_TABLE, results: [] }, { status: 500 });
  return NextResponse.json({ results: (data ?? []) as CaseStudyRow[] });
}

export async function POST(req: Request) {
  const me = await admin();
  if (!me) return deny();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = previewDb();

  if (b.action === "sign") {
    const ext = TYPES[String(b.type ?? "")];
    if (!ext) return NextResponse.json({ error: "Images only: PNG, JPG, WebP, GIF or AVIF." }, { status: 400 });
    const path = `c/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
    const { data, error } = await db.storage.from(CASE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: `Storage said no: ${error?.message ?? "unknown"}.` }, { status: 500 });
    return NextResponse.json({ path, token: data.token });
  }

  if (b.action === "add") {
    const { data: last } = await db.from("site_case_studies").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const order = (((last ?? [])[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 10;
    const { data, error } = await db.from("site_case_studies").insert({
      clinic: "", headline: "",
      stats: [{ value: "", label: "Average patient spend" }, { value: "", label: "Monthly membership revenue" }],
      uses: ["memberships", "rewards"], active: false, sort_order: order, created_by: me,
    }).select(COLS).single();
    if (error) return NextResponse.json({ error: `${NO_TABLE} (${error.message})` }, { status: 500 });
    return NextResponse.json({ result: data as CaseStudyRow });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function PATCH(req: Request) {
  if (!(await admin())) return deny();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = previewDb();

  if (Array.isArray(b.order)) {
    const ids = (b.order as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50);
    for (let i = 0; i < ids.length; i++) await db.from("site_case_studies").update({ sort_order: (i + 1) * 10 }).eq("id", ids[i]);
    return NextResponse.json({ ok: true });
  }

  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const clinic = text(b.clinic, 80); if (clinic !== undefined) patch.clinic = clinic;
  const headline = text(b.headline, 160); if (headline !== undefined) patch.headline = headline;
  const st = stats(b.stats); if (st) patch.stats = st;
  if (Array.isArray(b.uses)) patch.uses = Array.from(new Set((b.uses as unknown[]).filter(isResultUse)));
  if ("youtube" in b) patch.youtube = youtubeId(b.youtube);
  if (typeof b.active === "boolean") patch.active = b.active;
  for (const k of ["photo", "logo"] as const) {
    const key = `${k}_path`;
    if (!(key in b)) continue;
    const p = b[key];
    if (p === null) { patch[key] = null; patch[`${k}_url`] = null; continue; }
    if (typeof p !== "string" || !CASE_PATH_RE.test(p)) return NextResponse.json({ error: "Bad file path." }, { status: 400 });
    patch[key] = p;
    patch[`${k}_url`] = db.storage.from(CASE_BUCKET).getPublicUrl(p).data.publicUrl;
  }
  // A replaced or removed photo / logo: delete the old file once the row points elsewhere.
  const swapping = "photo_path" in patch || "logo_path" in patch;
  const { data: before } = swapping ? await db.from("site_case_studies").select("photo_path, logo_path").eq("id", id).maybeSingle() : { data: null };
  const { data, error } = await db.from("site_case_studies").update(patch).eq("id", id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (before) {
    const old = (["photo_path", "logo_path"] as const)
      .filter((k) => k in patch && before[k] && before[k] !== patch[k])
      .map((k) => before[k] as string)
      .filter((p) => CASE_PATH_RE.test(p));
    if (old.length) await db.storage.from(CASE_BUCKET).remove(old);
  }
  return NextResponse.json({ result: data as CaseStudyRow });
}

export async function DELETE(req: Request) {
  if (!(await admin())) return deny();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const db = previewDb();
  const { data: row } = await db.from("site_case_studies").select("photo_path, logo_path").eq("id", id).maybeSingle();
  const files = [row?.photo_path, row?.logo_path].filter((p): p is string => typeof p === "string" && CASE_PATH_RE.test(p));
  if (files.length) await db.storage.from(CASE_BUCKET).remove(files);
  const { error } = await db.from("site_case_studies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
