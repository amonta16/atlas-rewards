/**
 * GET /api/automations/email-dispatch — CP-217 · drains public.email_outbox through Resend.
 *
 * Vercel cron target (every minute, vercel.json). Same fail-closed auth as
 * /api/notifications/process-pending: `Authorization: Bearer $CRON_SECRET`
 * (or x-atlas-secret), via requireMachineSecret.
 *
 *  1. Requeue rows stuck in 'sending' for > 10 min (a crashed run). Resend's
 *     Idempotency-Key (= outbox.idempotency_key) makes a resend safe.
 *  2. Claim up to 50 'queued' rows by flipping them to 'sending' BEFORE any
 *     send (stamp-before-send), so overlapping cron runs never double-send.
 *  3. Render each with renderEmail()/emailFrom() — the exact layout the hub
 *     preview shows — and POST to Resend. reply_to = the clinic's contact email.
 *  4. Mark sent / failed / skipped. With RESEND_API_KEY unset every claimed row
 *     becomes skipped:'no_provider' (never crashes, never retries forever).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMachineSecret } from "@/lib/api-auth";
import { renderEmail, emailFrom } from "@/lib/automations/email-template";
import { signUnsubscribeToken } from "@/lib/automations/unsubscribe-token";
import { businessUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH = 50;
const STALE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
// Addresses that can never be a real inbox (seed/test data) are skipped, not sent.
const TEST_ADDRESS = /@(example\.(com|org|net)|[^@]+\.(test|invalid|example|localhost))$/i;

type OutboxRow = {
  id: string; business_id: string; membership_id: string | null; to_email: string;
  subject: string; preheader: string | null; heading: string | null; body: string;
  cta_label: string | null; cta_url: string | null; footnote: string | null; hero_url: string | null;
  idempotency_key: string; attempts: number;
};
type Biz = {
  id: string; name: string; slug: string; logo_url: string | null; hero_image_url: string | null;
  brand_colors: { primary?: string } | null; contact_info: { email?: string; address?: string } | null;
};

export async function GET(req: NextRequest) {
  const gate = requireMachineSecret(req);
  if (!gate.ok) {
    console.warn(`[email-dispatch] rejected: ${gate.error}`);
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const admin = createAdminClient();
  const now = new Date();

  // 1. stale claims back to the queue
  await admin.from("email_outbox").update({ status: "queued", claimed_at: null })
    .eq("status", "sending").lt("claimed_at", new Date(now.getTime() - STALE_MS).toISOString());

  // 2. claim
  const { data: queued, error: listErr } = await admin.from("email_outbox").select("id")
    .eq("status", "queued").order("created_at", { ascending: true }).limit(BATCH);
  if (listErr) {
    console.error("[email-dispatch] list failed:", listErr.message);
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  const ids = (queued ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, claimed: 0 });

  const { data: claimedRows, error: claimErr } = await admin.from("email_outbox")
    .update({ status: "sending", claimed_at: now.toISOString() })
    .in("id", ids).eq("status", "queued")
    .select("id, business_id, membership_id, to_email, subject, preheader, heading, body, cta_label, cta_url, footnote, hero_url, idempotency_key, attempts");
  if (claimErr) {
    console.error("[email-dispatch] claim failed:", claimErr.message);
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  const rows = (claimedRows ?? []) as OutboxRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, claimed: 0 });

  const finish = (id: string, patch: Record<string, unknown>) =>
    admin.from("email_outbox").update(patch).eq("id", id).eq("status", "sending");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await admin.from("email_outbox").update({ status: "skipped", error: "no_provider" }).in("id", rows.map((r) => r.id)).eq("status", "sending");
    console.warn(`[email-dispatch] RESEND_API_KEY not set — skipped ${rows.length} email(s)`);
    return NextResponse.json({ ok: true, claimed: rows.length, skipped: rows.length, reason: "no_provider" });
  }

  // lookups
  const bizIds = [...new Set(rows.map((r) => r.business_id))];
  const memIds = [...new Set(rows.map((r) => r.membership_id).filter((x): x is string => !!x))];
  const [{ data: bizRows }, { data: prefs }] = await Promise.all([
    admin.from("businesses").select("id, name, slug, logo_url, hero_image_url, brand_colors, contact_info").in("id", bizIds),
    memIds.length
      ? admin.from("member_comm_prefs").select("membership_id, email_opt_out_at").in("membership_id", memIds)
      : Promise.resolve({ data: [] as { membership_id: string; email_opt_out_at: string | null }[] }),
  ]);
  const bizById = new Map(((bizRows ?? []) as Biz[]).map((b) => [b.id, b]));
  const optedOut = new Set(((prefs ?? []) as { membership_id: string; email_opt_out_at: string | null }[])
    .filter((p) => !!p.email_opt_out_at).map((p) => p.membership_id));

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const abs = (u: string | null | undefined, slug?: string): string | null => {
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (!u.startsWith("/")) return null;
    return businessUrl(root, { slug, path: u });
  };

  let sent = 0, failed = 0, skipped = 0, requeued = 0;
  for (const r of rows) {
    try {
      const biz = bizById.get(r.business_id);
      if (!biz) { await finish(r.id, { status: "failed", error: "business_not_found" }); failed++; continue; }
      if (r.membership_id && optedOut.has(r.membership_id)) { await finish(r.id, { status: "skipped", error: "opted_out" }); skipped++; continue; }
      if (!r.membership_id) { await finish(r.id, { status: "skipped", error: "no_member" }); skipped++; continue; }
      if (TEST_ADDRESS.test(r.to_email)) { await finish(r.id, { status: "skipped", error: "test_address" }); skipped++; continue; }

      const unsubscribeUrl = businessUrl(root, { path: `/api/email/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(r.membership_id))}` });
      const { html, text } = renderEmail(
        {
          businessName: biz.name,
          logoUrl: abs(biz.logo_url),
          primary: biz.brand_colors?.primary ?? "#2d6a78",
          heroUrl: abs(r.hero_url) ?? abs(biz.hero_image_url),
          address: biz.contact_info?.address ?? null,
        },
        {
          subject: r.subject,
          preheader: r.preheader ?? undefined,
          heading: r.heading,
          body: r.body,
          ctaLabel: r.cta_label,
          ctaUrl: abs(r.cta_url, biz.slug),
          footnote: r.footnote,
          unsubscribeUrl,
        },
      );
      const replyTo = (biz.contact_info?.email ?? "").trim();
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": r.idempotency_key },
        body: JSON.stringify({
          from: emailFrom(biz.name).header,
          to: [r.to_email],
          subject: r.subject,
          html,
          text,
          ...(replyTo.includes("@") ? { reply_to: replyTo } : {}),
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { id?: string };
        await finish(r.id, { status: "sent", sent_at: new Date().toISOString(), provider_id: j.id ?? null, error: null, attempts: r.attempts + 1 });
        sent++;
      } else {
        const detail = (await res.text().catch(() => "")).slice(0, 400);
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && r.attempts + 1 < MAX_ATTEMPTS) {
          await finish(r.id, { status: "queued", claimed_at: null, attempts: r.attempts + 1, error: `resend ${res.status}: ${detail}` });
          requeued++;
        } else {
          await finish(r.id, { status: "failed", attempts: r.attempts + 1, error: `resend ${res.status}: ${detail}` });
          failed++;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (r.attempts + 1 < MAX_ATTEMPTS) {
        await finish(r.id, { status: "queued", claimed_at: null, attempts: r.attempts + 1, error: msg.slice(0, 400) });
        requeued++;
      } else {
        await finish(r.id, { status: "failed", attempts: r.attempts + 1, error: msg.slice(0, 400) });
        failed++;
      }
    }
  }

  console.log(`[email-dispatch] claimed=${rows.length} sent=${sent} failed=${failed} skipped=${skipped} requeued=${requeued}`);
  return NextResponse.json({ ok: true, claimed: rows.length, sent, failed, skipped, requeued });
}
