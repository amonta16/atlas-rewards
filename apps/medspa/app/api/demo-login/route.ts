import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/patient";

/** Example clinic only: "signs in" by setting a cookie. Never touches the database. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; email?: string };
  // CP-272: merge into the existing demo patient, so adding an email later keeps the name, phone and plan.
  let prev: Record<string, string> = {};
  try { prev = JSON.parse(decodeURIComponent(cookies().get(DEMO_COOKIE)?.value ?? "")) as Record<string, string>; } catch { /* none yet */ }
  const pick = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const value = encodeURIComponent(JSON.stringify({
    ...prev,
    ...(pick(body.name, 60) !== undefined ? { name: pick(body.name, 60) } : {}),
    ...(pick(body.phone, 16) !== undefined ? { phone: pick(body.phone, 16) } : {}),
    ...(pick(body.email, 120) !== undefined ? { email: pick(body.email, 120) } : {}),
  }));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
  return res;
}
