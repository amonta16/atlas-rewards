/**
 * Perfect Corp (YouCam) AI skin analysis + skin simulation, server side only.
 *
 * Docs: https://docs.perfectcorp.com/reference/ai_skin_analysis
 *       https://docs.perfectcorp.com/reference/ai_skin_simulation
 *
 * Flow: upload the selfie once (File API → pre-signed PUT), run Skin Analysis
 * V2.1 on it, then run Skin Simulation on the same file with strengths picked
 * from the weakest scores. Both are async tasks we poll.
 *
 * No PERFECTCORP_API_KEY → mock mode: believable fake scores and no network,
 * so the whole flow can be built and demoed without spending units.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { CONCERNS, ZONES, type ConcernId, type ScanMetric, type ScanResult, type SimKey, type ZoneId } from "./skin-scan";

const BASE = "https://yce-api-01.makeupar.com";
const KEY = process.env.PERFECTCORP_API_KEY?.trim() || "";

export const isMock = () => !KEY || process.env.SKIN_SCAN_MOCK === "1";

type Json = Record<string, unknown>;

async function pc<T = Json>(path: string, init?: { method?: string; body?: Json }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: Json = {};
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const code = (json.error_code as string) || (json.error as string) || `http_${res.status}`;
    throw new PerfectCorpError(code, res.status, (json.error as string) || text.slice(0, 200));
  }
  return json as T;
}

export class PerfectCorpError extends Error {
  constructor(public code: string, public status: number, message: string) { super(`${code}: ${message}`); }
}

/** Upload a JPEG and return Perfect Corp's file_id. */
export async function uploadSelfie(jpeg: Buffer): Promise<string> {
  const name = `scan_${createHash("sha1").update(jpeg).digest("hex").slice(0, 12)}.jpg`;
  const init = await pc<{ data: { files: { file_id: string; requests: { method: string; url: string; headers: Record<string, string> }[] }[] } }>(
    "/s2s/v2.0/file",
    { method: "POST", body: { files: [{ content_type: "image/jpeg", file_name: name, file_size: jpeg.length }] } },
  );
  const file = init.data.files[0];
  const put = file.requests[0];
  const up = await fetch(put.url, { method: put.method || "PUT", headers: put.headers, body: new Uint8Array(jpeg) });
  if (!up.ok) throw new PerfectCorpError("upload_failed", up.status, await up.text().catch(() => ""));
  return file.file_id;
}

/** Start Skin Analysis V2.1 (JSON results). HD needs a short side of at least 1080 px. */
export async function startAnalysis(fileId: string, hd: boolean): Promise<string> {
  const actions = CONCERNS.map((c) => (hd ? c.hd : c.sd));
  const r = await pc<{ data: { task_id: string } }>("/s2s/v2.1/task/skin-analysis", {
    method: "POST",
    body: { src_file_id: fileId, dst_actions: actions, format: "json" },
  });
  return r.data.task_id;
}

export async function startSimulation(fileId: string, strengths: Partial<Record<SimKey, number>>): Promise<string> {
  const r = await pc<{ data: { task_id: string } }>("/s2s/v2.0/task/skin-simulation", {
    method: "POST",
    body: { src_file_id: fileId, ...strengths },
  });
  return r.data.task_id;
}

type TaskStatus<R> = { data: { task_status: "running" | "success" | "error"; error?: string; error_message?: string; results?: R } };
export type Poll<T> = { status: "running" } | { status: "error"; error: string } | { status: "success"; value: T };

type AnalysisItem = { type: string; region?: string; raw_score?: number; ui_score?: number; score?: number; mask_urls?: string[] };

export async function pollAnalysis(taskId: string): Promise<Poll<Omit<ScanResult, "afterUrl" | "mock">>> {
  const r = await pc<TaskStatus<{ output?: AnalysisItem[] }>>(`/s2s/v2.1/task/skin-analysis/${encodeURIComponent(taskId)}`);
  const d = r.data;
  if (d.task_status === "running") return { status: "running" };
  if (d.task_status === "error") return { status: "error", error: d.error || "analysis_failed" };
  const items = d.results?.output ?? [];
  if (process.env.NODE_ENV !== "production") console.log("[skin-scan] analysis output", JSON.stringify(items).slice(0, 4000));
  return { status: "success", value: parseAnalysis(items) };
}

export async function pollSimulation(taskId: string): Promise<Poll<string>> {
  const r = await pc<TaskStatus<{ url?: string }>>(`/s2s/v2.0/task/skin-simulation/${encodeURIComponent(taskId)}`);
  const d = r.data;
  if (d.task_status === "running") return { status: "running" };
  if (d.task_status === "error" || !d.results?.url) return { status: "error", error: d.error || "simulation_failed" };
  return { status: "success", value: d.results.url };
}

/** Perfect Corp's flat output list → our metrics. Handles both HD ("hd_wrinkle" + region) and SD ("wrinkle") names. */
export function parseAnalysis(items: AnalysisItem[]): Omit<ScanResult, "afterUrl" | "mock"> {
  const num = (i?: AnalysisItem) => (i ? Number(i.ui_score ?? i.score ?? i.raw_score) : NaN);
  const metrics: ScanMetric[] = [];
  for (const c of CONCERNS) {
    const mine = items.filter((i) => i.type === c.hd || i.type === c.sd);
    if (!mine.length) continue;
    const whole = mine.find((i) => !i.region || i.region === "whole" || i.region === "all") ?? mine[0];
    const score = num(whole);
    if (!Number.isFinite(score)) continue;
    const zones = c.id === "lines"
      ? mine.filter((i) => i.region && ZONES.some((z) => z.id === i.region))
          .map((i) => ({ id: i.region as ZoneId, score: Math.round(num(i)), masks: i.mask_urls ?? [] }))
          .filter((z) => Number.isFinite(z.score))
      : undefined;
    metrics.push({ id: c.id, score: Math.round(score), masks: whole.mask_urls ?? [], ...(zones?.length ? { zones } : {}) });
  }
  const all = items.find((i) => i.type === "all");
  const age = items.find((i) => i.type === "skin_age");
  const resized = items.find((i) => i.type === "resize_image")?.mask_urls?.[0] ?? null;
  const overall = Number.isFinite(num(all)) ? Math.round(num(all)) : Math.round(metrics.reduce((s, m) => s + m.score, 0) / Math.max(1, metrics.length));
  return { overall, skinAge: Number.isFinite(num(age)) ? Math.round(num(age)) : null, metrics, photoUrl: resized };
}

/* ── Mock mode ─────────────────────────────────────────────────────────── */

/** Stable fake scores from the photo's bytes: the same selfie always scores the same. */
export function mockAnalysis(jpeg: Buffer): Omit<ScanResult, "afterUrl" | "mock"> {
  const h = createHash("sha256").update(jpeg).digest();
  let i = 0;
  const next = (lo: number, hi: number) => lo + (h[i++ % h.length] / 255) * (hi - lo);
  const base: Record<ConcernId, [number, number]> = {
    lines: [58, 82], texture: [60, 84], pores: [55, 80], spots: [62, 88], redness: [60, 86], acne: [72, 94],
    dark_circles: [58, 80], eye_bags: [64, 86], tear_trough: [62, 84], firmness: [66, 90], hydration: [60, 82], radiance: [60, 84],
  };
  const metrics: ScanMetric[] = CONCERNS.map((c) => ({
    id: c.id,
    score: Math.round(next(...base[c.id])),
    masks: [],
    ...(c.id === "lines" ? { zones: ZONES.map((z) => ({ id: z.id, score: Math.round(next(55, 88)), masks: [] })) } : {}),
  }));
  const overall = Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length);
  return { overall, skinAge: Math.round(next(26, 44)), metrics, photoUrl: null };
}

/* ── Signed scan tokens ────────────────────────────────────────────────── */
// The preview call only runs on a file this server uploaded, so the endpoint
// can't be used to spend units on arbitrary images.

const SECRET = () => KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "atlas-skin-scan-dev";

export function signToken(fileId: string, clinic: string): string {
  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ f: fileId, c: clinic, e: exp })).toString("base64url");
  const sig = createHmac("sha256", SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken(token: string, clinic: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", SECRET()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { f: string; c: string; e: number };
    return p.c === clinic && p.e > Date.now() ? p.f : null;
  } catch { return null; }
}
