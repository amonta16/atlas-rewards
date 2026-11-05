import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import { getClinic } from "@/lib/clinic";
import { DEMO_COOKIE } from "@/lib/patient";
import { DEMO_REVIEW_COOKIE } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * "I left a Google review." Goes into the same review queue the desk confirms
 * (submit_review → approve_review awards the points). The example clinic has
 * no database, so it credits the demo points straight away.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });

  if (clinic.isExample && clinic.id === "example") {
    if (!cookies().get(DEMO_COOKIE)?.value) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const res = NextResponse.json({ earned: clinic.reviewPoints });
    res.cookies.set(DEMO_REVIEW_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
    return res;
  }

  const user = await getCachedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const { error } = await createClient().rpc("submit_review", { p_business_id: clinic.id, p_review_link: null, p_screenshot_url: null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ pending: true });
}
