import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteFontClass } from "@/lib/landing/site-fonts";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { PrecallPage } from "@/components/medspa/precall-page";
import { PRECALL_PREP, PRECALL_VIDEO, PRICE_BEFORE_CALL } from "@/lib/landing/medspa-funnel";
import "../../../site.css";

/**
 * /medspa/confirm/<token> — CP-201 · the pre-call page (funnel step "pre-sell").
 * Where a qualified lead lands right after booking, and what every reminder
 * links back to. Short video, "Yes, I'll be there", add to calendar, what to
 * have ready. The token is unguessable and only ever emailed to the prospect.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Your Atlas walkthrough: one step left" },
  robots: { index: false, follow: false },
};
export const viewport = { themeColor: "#FFFFFF" };

export default async function Page({ params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(params.token)) notFound();
  const { data: r } = await createAdminClient().from("landing_demo_requests")
    .select("name, business, slot_start, timezone, meet_url, confirmed_at, video_pct, outcome")
    .eq("confirm_token", params.token).maybeSingle();
  if (!r || !r.slot_start) notFound();
  return (
    <>
      <MetaPixel />
      <div className={siteFontClass}>
        <PrecallPage
          token={params.token}
          firstName={String(r.name ?? "").split(" ")[0]}
          business={r.business ?? ""}
          slotStart={r.slot_start}
          timezone={r.timezone}
          meetUrl={r.meet_url}
          confirmed={!!r.confirmed_at}
          past={!!r.outcome || Date.parse(r.slot_start) + 60 * 60_000 < Date.now()}
          video={PRECALL_VIDEO}
          prep={PRECALL_PREP}
          priceLine={PRICE_BEFORE_CALL}
        />
      </div>
    </>
  );
}
