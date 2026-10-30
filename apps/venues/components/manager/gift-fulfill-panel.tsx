"use client";
/**
 * GiftFulfillPanel — CP-180 · scanned gift code (welcome / birthday / win-back)
 *
 * A customer's wallet gift carries a 7-character code. Redemptions (points
 * spent) always got a full "deliver this" screen on scan; gifts got a bare
 * browser confirm() with the offer title and then NOTHING — no photo, no
 * "$10 Credits", no confirmation it went through. This is the same screen
 * for gifts: who it's for, what to hand over (the gift REWARD, not the
 * offer's marketing title), whether it's still good, and a receipt.
 */
import { useState } from "react";
import { ArrowLeft, Check, Gift, Clock, AlertCircle, Cake, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

export type GiftLookup = {
  saved_id: string; membership_id: string;
  full_name: string | null; email: string | null;
  offer_id: string; title: string; description: string | null; image_url: string | null;
  discount_type: string | null; discount_value: number | null;
  expires_at: string | null; fulfilled_at: string | null;
  // CP-180 — present once cp180_gift_scan_and_wallet.sql is applied.
  gift_reward_name?: string | null; gift_reward_description?: string | null; gift_reward_image_url?: string | null;
  gift_kind?: string | null; redeem_code?: string | null; saved_at?: string | null; is_expired?: boolean | null;
};

/** What the desk hands over, in words. Reward name wins; else describe the discount. */
function giftHeadline(g: GiftLookup): string {
  if (g.gift_reward_name) return g.gift_reward_name;
  if (g.discount_type === "percent" && g.discount_value) return `${g.discount_value}% off`;
  if (g.discount_type === "flat_cents" && g.discount_value) return `$${(g.discount_value / 100).toFixed(2).replace(/\.00$/, "")} off`;
  return g.title;
}

function kindLabel(kind: string | null | undefined): string {
  if (kind === "birthday") return "Birthday gift";
  if (kind === "signup") return "Welcome gift";
  return "Gift";
}

export function GiftFulfillPanel({
  business, gift, onClose,
}: { business: Business; gift: GiftLookup; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const primary = business.brand_colors.primary;
  const name = giftHeadline(gift);
  const image = gift.gift_reward_image_url || gift.image_url;
  const detail = gift.gift_reward_description || (gift.gift_reward_name ? null : gift.description);
  const delivered = !!gift.fulfilled_at;
  const expired = !delivered && (gift.is_expired ?? (gift.expires_at ? new Date(gift.expires_at).getTime() <= Date.now() : false));
  const canDeliver = !delivered && !expired;
  const KindIcon = gift.gift_kind === "birthday" ? Cake : gift.gift_kind === "signup" ? PartyPopper : Gift;

  async function deliver() {
    setSubmitting(true);
    setErr(null);
    const { error } = await createClient().rpc("fulfill_saved_offer", { p_saved_id: gift.saved_id });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: primary }}>
        <div className="bg-white rounded-full h-20 w-20 flex items-center justify-center mb-6">
          <Check className="h-10 w-10" style={{ color: primary }} />
        </div>
        <div className="text-white text-center">
          <div className="text-sm uppercase tracking-widest opacity-85">{kindLabel(gift.gift_kind)} delivered</div>
          <div className="text-3xl font-bold mt-2">{name}</div>
          <div className="text-base mt-2 opacity-90">for {gift.full_name ?? "the member"}</div>
        </div>
        <Button onClick={onClose} className="mt-10 bg-white text-zinc-900 hover:bg-zinc-100 w-full max-w-xs h-12 text-base">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <div className="text-sm font-bold">{kindLabel(gift.gift_kind)}</div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 flex-1 w-full">
        {(delivered || expired) && (
          <div className={`rounded-2xl p-4 mb-4 flex items-center gap-3 ${delivered ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">{delivered ? "Already handed over" : "Expired"}</div>
              <div className="text-xs">
                {delivered && gift.fulfilled_at && `Delivered ${new Date(gift.fulfilled_at).toLocaleString()}`}
                {expired && gift.expires_at && `This gift expired ${new Date(gift.expires_at).toLocaleDateString()} and can't be used.`}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border bg-white overflow-hidden">
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt={name} className="h-44 w-full object-cover" />
          ) : (
            <div className="h-32 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${primary}20 0%, ${primary}40 100%)` }}>
              <KindIcon className="h-12 w-12" style={{ color: primary }} />
            </div>
          )}
          <div className="p-5">
            <div className="text-[10px] uppercase tracking-widest font-bold inline-flex items-center gap-1.5" style={{ color: primary }}>
              <KindIcon className="h-3 w-3" /> {kindLabel(gift.gift_kind)} · free
            </div>
            <h2 className="text-xl font-bold mt-1">{name}</h2>
            {detail && <p className="text-sm text-muted-foreground mt-1">{detail}</p>}

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Member</div>
                <div className="font-medium mt-0.5 truncate">{gift.full_name ?? "Unnamed"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cost</div>
                <div className="font-medium mt-0.5">Free · no points</div>
              </div>
              {gift.redeem_code && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Code</div>
                  <div className="font-mono font-bold tracking-wider mt-0.5">{gift.redeem_code}</div>
                </div>
              )}
              {gift.expires_at && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Good until</div>
                  <div className="font-medium mt-0.5">{new Date(gift.expires_at).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

        {canDeliver ? (
          <div className="mt-6 space-y-2">
            <p className="text-center text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 inline mr-1" />
              Verify the member is here. Tap to hand over the gift.
            </p>
            <Button onClick={deliver} disabled={submitting} className="w-full h-14 text-base text-white" style={{ background: primary }}>
              {submitting ? "Marking delivered…" : `Deliver ${name}`}
            </Button>
            <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          </div>
        ) : (
          <div className="mt-6">
            <Button variant="outline" className="w-full" onClick={onClose}>Back to dashboard</Button>
          </div>
        )}
      </main>
    </div>
  );
}
