import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/patient";

/** Example clinic only: "signs in" by setting a cookie. Never touches the database. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
  const value = encodeURIComponent(JSON.stringify({ name: String(body.name ?? "").slice(0, 60), phone: String(body.phone ?? "").slice(0, 16) }));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
  return res;
}
