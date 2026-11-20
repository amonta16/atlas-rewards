import crypto from "crypto";
import { NextResponse } from "next/server";
import { sendFcm } from "@/lib/fcm-server";

/**
 * POST /api/push/deliver: sends pushes to MedSpa App phones (Google Play app)
 * through the MedSpa App's own Firebase project.
 *
 * Who gets a push is still decided by the shared notification engine (venue
 * app: rewards, offers, win-back, broadcasts). For rows saved by the MedSpa
 * App (endpoint "fcm-medspa:<token>") it calls this route instead of sending
 * them itself, so the two apps never share push credentials.
 *
 * Auth: header x-medspa-push-secret = MEDSPA_PUSH_SECRET (set on both Vercel
 * projects). Fails closed when the secret isn't configured.
 *
 * Body: { tokens: string[], payload: { title, body?, link_path?, kind?, slug? } }
 * Reply: { sent, failed, dead: string[] }; the caller deletes the dead rows.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretOk(given: string | null): boolean {
  const want = (process.env.MEDSPA_PUSH_SECRET ?? "").trim();
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-medspa-push-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    tokens?: unknown;
    payload?: { title?: unknown; body?: unknown; link_path?: unknown; kind?: unknown; slug?: unknown };
  } | null;
  const tokens = Array.isArray(body?.tokens)
    ? Array.from(new Set(body!.tokens.filter((t): t is string => typeof t === "string" && t.length >= 20 && t.length <= 4096)))
    : [];
  const p = body?.payload;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const title = str(p?.title, 200);
  if (!title || tokens.length === 0 || tokens.length > 1000) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const payload = { title, body: str(p?.body, 1000), link_path: str(p?.link_path, 500), kind: str(p?.kind, 60), slug: str(p?.slug, 80) };

  let sent = 0, failed = 0;
  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += 50) {
    await Promise.all(tokens.slice(i, i + 50).map(async (t) => {
      const r = await sendFcm(t, payload);
      if (r === "sent") sent++;
      else if (r === "dead") { failed++; dead.push(t); }
      else if (r === "failed") failed++;
    }));
  }
  return NextResponse.json({ sent, failed, dead });
}
