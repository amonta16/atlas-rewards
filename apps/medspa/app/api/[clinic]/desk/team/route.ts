import { NextResponse, type NextRequest } from "next/server";

/**
 * Team actions from the desk, handed to the venue app's existing team routes
 * (they hold the server permissions to create accounts): create-account and
 * revoke. The manager's session cookie is forwarded, so those routes run
 * their usual "is this person a manager of this business" checks.
 */
export const dynamic = "force-dynamic";
const ALLOWED = new Set(["create-account", "revoke"]);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string } & Record<string, unknown>;
  if (!body.action || !ALLOWED.has(body.action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (body.action === "create-account" && body.role !== "business_staff" && body.role !== "business_manager") {
    return NextResponse.json({ error: "The desk can add front desk staff and managers only." }, { status: 400 });
  }
  const { action, ...rest } = body;
  const origin = process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app";
  try {
    const res = await fetch(`${origin}/api/team/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify(rest),
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the team service. Try again." }, { status: 502 });
  }
}
