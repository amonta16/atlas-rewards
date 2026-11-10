import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@atlas/core/supabase/server";
import { getClinic, skinScanOn } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import {
  isMock, mockAnalysis, PerfectCorpError, pollAnalysis, pollSimulation, readToken, signToken,
  startAnalysis, startSimulation, uploadSelfie,
} from "@/lib/perfectcorp";
import { CONCERNS, type ConcernId, type SimKey } from "@/lib/skin-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * AI skin scan (Perfect Corp). The browser drives it in three steps:
 *   POST {action:"start", image, hd}      → upload + start the analysis → {token, analysisTask}
 *   GET  ?analysis=<task>                 → poll until the scores are ready
 *   POST {action:"preview", token, sim}   → start the "after" simulation → {simulationTask}
 *   GET  ?simulation=<task>               → poll until the preview image is ready
 *   POST {action:"save", scan}            → signed-in patient: keep the scores for the desk's Skin scans list
 * The selfie goes straight to Perfect Corp; nothing is stored on our side.
 */

const SIM_KEYS = new Set<string>(CONCERNS.map((c) => c.sim).filter(Boolean) as string[]);
const MAX_BYTES = 6 * 1024 * 1024;

// Light abuse guard: each live scan spends API units. Per server instance, so
// it's a speed bump, not a wall.
const hits = new Map<string, number[]>();
function allow(ip: string, limit = 8, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) return false;
  list.push(now);
  hits.set(ip, list);
  return true;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

function friendly(e: unknown): { error: string; status: number } {
  if (e instanceof PerfectCorpError) {
    console.error("[skin-scan]", e.message);
    if (e.code === "CreditInsufficiency") return { error: "The skin scan is resting right now. Please try again later.", status: 503 };
    if (e.status === 401) return { error: "The skin scan isn't set up yet.", status: 503 };
    if (e.status === 429) return { error: "Lots of scans right now. Try again in a minute.", status: 429 };
  } else console.error("[skin-scan]", e);
  return { error: "Something went wrong. Please try again.", status: 502 };
}

/** Perfect Corp's photo errors, in words a patient can act on. */
const PHOTO_ERRORS: Record<string, string> = {
  error_src_face_too_small: "Move closer so your face fills the oval.",
  error_src_face_out_of_bound: "Keep your whole face inside the frame.",
  error_lighting_dark: "It's a little dark. Face a window or a lamp and try again.",
  error_no_face: "We couldn't find a face. Look straight at the camera.",
  error_pose: "Look straight ahead with your head level.",
  error_face_parsing: "Pull your hair back and remove glasses, then try again.",
  error_below_min_image_size: "That photo is too small. Use the camera or a bigger photo.",
  error_nsfw_content_detected: "Please use a clear photo of your face.",
};

export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return fail("Clinic not found.", 404);
  if (!skinScanOn(clinic)) return fail("The skin scan isn't available here.", 404);
  const body = (await req.json().catch(() => null)) as { action?: string; image?: string; hd?: boolean; token?: string; sim?: Record<string, number>; scan?: SaveBody } | null;
  if (!body?.action) return fail("Bad request.");

  if (body.action === "save") return save(clinic, body.scan);

  if (body.action === "start") {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
    if (!m) return fail("Please send a JPEG photo.");
    const jpeg = Buffer.from(m[1], "base64");
    if (jpeg.length > MAX_BYTES) return fail("That photo is too large.");

    if (isMock()) {
      return NextResponse.json({ mock: true, result: { ...mockAnalysis(jpeg), afterUrl: null, mock: true } });
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!allow(ip)) return fail("You've run a few scans already. Try again in an hour.", 429);
    try {
      const fileId = await uploadSelfie(jpeg);
      const analysisTask = await startAnalysis(fileId, !!body.hd);
      return NextResponse.json({ token: signToken(fileId, clinic.slug), analysisTask });
    } catch (e) {
      const f = friendly(e);
      return fail(f.error, f.status);
    }
  }

  if (body.action === "preview") {
    if (isMock()) return NextResponse.json({ mock: true });
    const fileId = readToken(body.token ?? "", clinic.slug);
    if (!fileId) return fail("This scan has expired. Please scan again.", 410);
    const sim: Partial<Record<SimKey, number>> = {};
    for (const [k, v] of Object.entries(body.sim ?? {})) {
      if (SIM_KEYS.has(k) && typeof v === "number" && v > 0) sim[k as SimKey] = Math.min(1, Math.max(0, v));
    }
    if (!Object.keys(sim).length) sim.radiance = 0.5;
    try {
      return NextResponse.json({ simulationTask: await startSimulation(fileId, sim) });
    } catch (e) {
      const f = friendly(e);
      return fail(f.error, f.status);
    }
  }

  return fail("Bad request.");
}

type SaveBody = { overall?: number; skinAge?: number | null; metrics?: { id: string; score: number }[]; goals?: string[]; treatments?: string[] };
const CONCERN_IDS = new Set<string>(CONCERNS.map((c) => c.id));
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);

/**
 * Keep a signed-in patient's scan (scores only: never the photo) so the desk
 * can follow up. The demo / instant previews have no database: the browser
 * keeps it for the demo desk instead, so we just hand back who it belongs to.
 */
async function save(clinic: NonNullable<Awaited<ReturnType<typeof getClinic>>>, scan: SaveBody | undefined) {
  const patient = await getPatient(clinic);
  if (!patient.signedIn) return fail("Please sign in to save your results.", 401);
  const overall = int(scan?.overall, 0, 100);
  const metrics = (scan?.metrics ?? []).filter((m) => CONCERN_IDS.has(m.id)).map((m) => ({ id: m.id as ConcernId, score: int(m.score, 0, 100) ?? 0 })).slice(0, 20);
  if (overall === null || !metrics.length) return fail("Bad request.");
  const row = {
    overall, skin_age: int(scan?.skinAge, 10, 99), metrics,
    goals: (scan?.goals ?? []).filter((g) => CONCERN_IDS.has(g)).slice(0, 12),
    treatments: (scan?.treatments ?? []).map((t) => String(t).slice(0, 80)).slice(0, 5),
  };
  if (clinic.id === "example") {
    return NextResponse.json({ saved: "local", row: { ...row, full_name: patient.fullName, phone: patient.phone, created_at: new Date().toISOString() } });
  }
  const { error } = await createClient().from("medspa_skin_scans").insert({
    business_id: clinic.id, user_id: patient.userId, membership_id: patient.membershipId, ...row,
  });
  if (error) { console.error("[skin-scan] save", error.message); return fail("Couldn't save your results. Please try again.", 500); }
  return NextResponse.json({ saved: true });
}

export async function GET(req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic || !skinScanOn(clinic)) return fail("Clinic not found.", 404);
  const analysis = req.nextUrl.searchParams.get("analysis");
  const simulation = req.nextUrl.searchParams.get("simulation");
  try {
    if (analysis) {
      const p = await pollAnalysis(analysis);
      if (p.status === "error") return NextResponse.json({ status: "error", error: PHOTO_ERRORS[p.error] ?? "We couldn't read that photo. Try again in even light, facing the camera." });
      if (p.status === "running") return NextResponse.json({ status: "running" });
      if (!p.value.metrics.length) return NextResponse.json({ status: "error", error: "We couldn't read that photo. Try again in even light, facing the camera." });
      return NextResponse.json({ status: "success", result: { ...p.value, afterUrl: null, mock: false } });
    }
    if (simulation) {
      const p = await pollSimulation(simulation);
      if (p.status === "success") return NextResponse.json({ status: "success", url: p.value });
      return NextResponse.json(p.status === "running" ? { status: "running" } : { status: "error", error: "The preview couldn't be made for this photo." });
    }
  } catch (e) {
    const f = friendly(e);
    return fail(f.error, f.status);
  }
  return fail("Bad request.");
}
