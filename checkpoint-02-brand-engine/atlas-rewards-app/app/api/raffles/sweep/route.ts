/**
 * POST /api/raffles/sweep — CP-85
 *
 * Lazy raffle finalizer + push fan-out. Called fire-and-forget by:
 *   • the customer RaffleSection on mount (Rewards tab), and
 *   • the staff raffle panel inside the Offers manager.
 *
 * It invokes finalize_due_raffles() with the service-role client. The RPC
 * is once-only per raffle (row lock + status guard in SQL), and it RETURNS
 * only the raffles THIS call actually finalized — so pushes never
 * double-send even with the pg_cron backstop running in parallel (whoever
 * transitions the row is the only one who gets rows back).
 *
 * In-app bell rows are written inside the SQL (winner + owner/front-desk
 * team). This route adds the synchronous phone pushes on top — same proven
 * path announce-offer uses (sendPushToUsers, tenant-scoped by business).
 *
 * Body: {} — nothing needed; the sweep is global and cheap (indexed scan
 * over active raffles past their end). No auth required: the endpoint only
 * triggers draws that are already due, which is exactly what the cron
 * would do anyway.
 *
 * Returns: { ok, finalized: [{ raffle_id, state }] }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FinalizedRow = {
  raffle_id: string;
  business_id: string;
  title: string;
  prize: string;
  out_state: "winner_selected" | "ended_no_entries";
  winner_user_id: string | null;
  winner_name: string | null;
};

export async function POST() {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("finalize_due_raffles");
  if (error) {
    console.warn("[raffles/sweep] finalize failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as FinalizedRow[];

  for (const r of rows) {
    try {
      if (r.out_state === "winner_selected" && r.winner_user_id) {
        // The winner's phone lights up.
        await sendPushToUsers(
          [r.winner_user_id],
          {
            title: "🎉 You WON the giveaway!",
            body: `${r.title} — ${r.prize}. Open the app to claim your prize.`,
            link_path: "/app/rewards",
            kind: "raffle_won",
          },
          r.business_id,
        );
      }

      // Owner / front-desk team push (their in-app bell rows were already
      // written by the SQL — this is the phone buzz on top).
      const { data: staff } = await admin
        .from("business_users")
        .select("user_id, business_id, role")
        .or(`business_id.eq.${r.business_id},and(business_id.is.null,role.eq.agency_admin)`);
      const staffIds = Array.from(
        new Set((staff ?? []).map((s: any) => s.user_id).filter(Boolean)),
      ) as string[];
      if (staffIds.length > 0) {
        await sendPushToUsers(
          staffIds,
          r.out_state === "winner_selected"
            ? {
                title: "Raffle winner selected 🎟️",
                body: `"${r.title}" — winner: ${r.winner_name ?? "a member"}. Prize: ${r.prize}.`,
                link_path: "/manage",
                kind: "raffle_winner_drawn",
              }
            : {
                title: "Raffle ended — no entries",
                body: `"${r.title}" ended with no eligible entries. No winner was drawn.`,
                link_path: "/manage",
                kind: "raffle_ended",
              },
          r.business_id,
        );
      }
    } catch (e) {
      console.warn("[raffles/sweep] push failed:", (e as any)?.message);
    }
  }

  return NextResponse.json({
    ok: true,
    finalized: rows.map((r) => ({ raffle_id: r.raffle_id, state: r.out_state })),
  });
}
