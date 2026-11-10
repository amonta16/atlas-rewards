import { NextResponse } from "next/server";
import { verify } from "@/lib/landing/funnel-sign";
import { previewDb } from "@/lib/preview/store";

/**
 * GET/POST /api/landing/unsubscribe?p=<preview id>&s=<sig> — CP-238.
 * Stops the lead-magnet follow-up emails for one owner. Signed link (no login),
 * so nobody can unsubscribe someone else. POST is the one-click
 * List-Unsubscribe-Post that Gmail and Apple Mail send.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function stop(req: Request): Promise<boolean> {
  const u = new URL(req.url);
  const id = u.searchParams.get("p") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !verify(u.searchParams.get("s"), id, "unsubscribe")) return false;
  const { error } = await previewDb().from("app_previews").update({ nurture_unsubscribed_at: new Date().toISOString() }).eq("id", id).is("nurture_unsubscribed_at", null);
  if (error) console.error("[unsubscribe]", error.message);
  return true;
}

const page = (ok: boolean) => new NextResponse(
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="margin:0;display:grid;min-height:100vh;place-items:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F6F7;color:#171B26;">
<div style="max-width:380px;padding:32px;background:#fff;border-radius:20px;text-align:center;">
<h1 style="font-size:20px;margin:0 0 8px;">${ok ? "You're unsubscribed" : "That link didn't work"}</h1>
<p style="font-size:15px;line-height:1.5;color:#6E7380;margin:0;">${ok ? "No more follow-up emails about your app preview. Questions? Reply to any email and Andrew will answer." : "Reply to the email instead and we'll take you off the list."}</p>
</div></body></html>`,
  { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
);

export async function GET(req: Request) { return page(await stop(req)); }
export async function POST(req: Request) { const ok = await stop(req); return new NextResponse(null, { status: ok ? 200 : 400 }); }
