/**
 * /api/raffles/sweep — CP-85, secured + cron-enabled in CP-88
 *
 * Lazy raffle finalizer + push fan-out. It invokes finalize_due_raffles()
 * with the service-role client. The RPC is once-only per raffle (row lock +
 * status guard in SQL), and it RETURNS only the raffles THIS call actually
 * finalized — so pushes never double-send even with the pg_cron backstop
 * running in parallel (whoever transitions the row is the only one who gets
 * rows back). That property is what makes it safe to have several callers.
 *
 * In-app bell rows are written inside the SQL (winner + owner/front-desk
 * team). This route adds the synchronous phone pushes on top — same proven
 * path announce-offer uses (sendPushToUsers, tenant-scoped by business).
 *
 * ── CP-88 SECURITY ───────────────────────────────────────────────
 * The old header said "No auth required: the endpoint only triggers draws
 * that are already due, which is exactly what the cron would do anyway."
 * Two problems with that reasoning:
 *
 *   1. It's an unauthenticated endpoint that takes a service-role WRITE path
 *      and a push fan-out. Even if every individual call is semantically
 *      harmless, an open service-role write is free DoS: hammer it and you
 *      queue row locks in Postgres and burn connections, on your bill.
 *
 *   2. It was called by EVERY CUSTOMER on mount of the Rewards tab
 *      (components/customer/raffle-section.tsx, three separate call sites).
 *      At 1,000 customers that's 1,000 concurrent global sweeps serializing
 *      on the same row lock, for work that only needs doing once.
 *
 * Fixed in two places: these gates, and removing the customer-side calls.
 *
 * ── CP-88 CRON ───────────────────────────────────────────────────
 * Removing the customer-side calls means something else has to guarantee a
 * due raffle actually gets drawn. pg_cron was already the backstop, but that
 * lives in the database and is easy to have never installed — so this route
 * now also exposes GET for Vercel Cron (which issues GET, not POST) and
 * `vercel.json` schedules it every 5 minutes. Belt and braces: whichever
 * runs first wins the row lock, the other gets zero rows back.
 *
 *   GET  → machine secret only (Vercel Cron sends `Authorization: Bearer`).
 *   POST → machine secret OR a signed-in session, so staff can still trigger
 *          a sweep by hand from the raffle manager
 *          (components/agency/raffle-manager.tsx:391 — same-origin fetch,
 *          cookies ride along). Customers no longer call it at all.
 *
 * Returns: { ok, finalized: [{ raffle_id, state }] }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";
import { requireMachineSecret, requireMachineSecretOrSession } from "@/lib/api-auth";

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

/** The actual work. Callers must have passed a gate first. */
async function runSweep() {
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

  if (rows.length > 0) {
    console.log(`[raffles/sweep] finalized=${rows.length}`);
  }

  return NextResponse.json({
    ok: true,
    finalized: rows.map((r) => ({ raffle_id: r.raffle_id, state: r.out_state })),
  });
}

/** Vercel Cron target. Cron issues GET with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const gate = requireMachineSecret(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  return runSweep();
}

/** Staff-initiated sweep from the raffle manager, or any machine caller. */
export async function POST(req: Request) {
  const gate = await requireMachineSecretOrSession(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  return runSweep();
}
