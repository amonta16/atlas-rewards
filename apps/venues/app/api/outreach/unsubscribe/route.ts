import { NextResponse } from "next/server";
import { verifyUnsubscribe } from "@/lib/outreach/config";
import { db, stopLead, suppress } from "@/lib/outreach/engine";

/**
 * GET/POST /api/outreach/unsubscribe?l=<lead id>&s=<sig> — CP-250.
 * The opt-out link in outreach emails sent with opt-out style "link" (CP-250d; the default "reply" style has
 * no link). Keep it working for every link already sent. Signed, so nobody can unsubscribe someone
 * else; works without logging in, takes effect at once, and stays working (no expiry). POST is the
 * one-click List-Unsubscribe-Post that Gmail and Apple Mail send.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function stop(req: Request): Promise<boolean> {
  const u = new URL(req.url);
  const id = u.searchParams.get("l") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !verifyUnsubscribe(id, u.searchParams.get("s"))) return false;
  const { data: lead } = await db().from("outreach_leads").select("id, email").eq("id", id).maybeSingle();
  if (!lead) return true; // already removed: still a success for them
  if (lead.email) await suppress(String(lead.email), "unsubscribed");
  await stopLead(id, "unsubscribed", "Used the unsubscribe link");
  return true;
}

const page = (ok: boolean) => new NextResponse(
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribed</title></head>
<body style="margin:0;display:grid;min-height:100vh;place-items:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F6F7;color:#171B26;">
<div style="max-width:380px;padding:32px;background:#fff;border-radius:20px;text-align:center;">
<h1 style="font-size:20px;margin:0 0 8px;">${ok ? "You're unsubscribed" : "That link didn't work"}</h1>
<p style="font-size:15px;line-height:1.5;color:#6E7380;margin:0;">${ok ? "You won't get any more emails from Atlas Engine about this. Sorry for the bother." : "Reply to the email with “unsubscribe” and we'll take you off the list right away."}</p>
</div></body></html>`,
  { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
);

export async function GET(req: Request) { return page(await stop(req)); }
export async function POST(req: Request) { const ok = await stop(req); return new NextResponse(null, { status: ok ? 200 : 400 }); }
