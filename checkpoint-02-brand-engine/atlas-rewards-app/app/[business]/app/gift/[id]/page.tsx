/**
 * /<slug>/app/gift/<id> — CP-224 · the win-back gift, straight from the push.
 *
 * The "We miss you" notification links here. The gift is loaded on the
 * server so the scratch card is on screen the moment the page paints — no
 * Home, no spinner, no popups in between. Scratching reveals the reward and
 * credits the bonus points (claim_gift) in the same motion.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { GiftScratchScreen, type GiftData } from "@/components/customer/gift-scratch-screen";

export const dynamic = "force-dynamic";

export default async function GiftPage({ params }: { params: { business: string; id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const supabase = createClient();
  const [{ data }, { data: { user } }] = await Promise.all([
    supabase.rpc("my_gift", { p_message_id: params.id }),
    supabase.auth.getUser(),
  ]);
  const gift = (data ?? null) as GiftData | null;
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  return <GiftScratchScreen business={business} gift={gift && gift.business_id === business.id ? gift : null} fullName={fullName} />;
}
