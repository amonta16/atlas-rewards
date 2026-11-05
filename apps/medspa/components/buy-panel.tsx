"use client";
/**
 * Buy a Shop item. Step one: quantity (skincare) or amount + who it's for
 * (gift cards), then "Add to cart". Step two: the Shopping Cart screen
 * (item, what it unlocks, summary), then card / Apple Pay / Google Pay, or
 * pay over time (Klarna / Affirm) when the clinic offers it. Clinics without
 * Stripe get "Reserve" and pay at the desk. Guests hit the sign-in prompt first.
 */
import { useState } from "react";
import { optimizedUrl } from "@atlas/core/img";
import { financingFits, FINANCING_LIMITS, type FinancingMethod, type MedspaShopItem } from "@/lib/medspa";
import { priceLabel } from "@/lib/plans";
import type { ClinicReward } from "@/lib/clinic";
import { useGate } from "./gate";
import { IcBack, IcGift } from "./icons";
import { Portal } from "./portal";

type Props = {
  slug: string;
  item: Pick<MedspaShopItem, "id" | "kind" | "amounts" | "price_cents" | "member_price_cents">;
  itemName: string;
  image: string | null;
  pickupNote: string;
  isMember: boolean;
  takesCards: boolean;
  financing: { klarna: boolean; affirm: boolean };
  points: number;
  /** Points per $1 once the order is paid (the paid-order trigger, CP-231). Gift cards earn when they're spent. */
  earnRate: number;
  rewards: ClinicReward[];
};

export function BuyPanel({ slug, item, itemName, image, pickupNote, isMember, takesCards, financing, points, earnRate, rewards }: Props) {
  const { require } = useGate();
  const isGift = item.kind === "gift_card";
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState<number | null>(isGift ? item.amounts[1] ?? item.amounts[0] ?? null : null);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [cart, setCart] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unit = isGift ? amount : (isMember && item.member_price_cents ? item.member_price_cents : item.price_cents);
  const count = item.kind === "product" ? qty : 1;
  const total = unit != null ? unit * count : null;
  const payLater = takesCards && total != null
    ? (["klarna", "affirm"] as FinancingMethod[]).filter((m) => financing[m] && financingFits(m, total))
    : [];
  const earn = total != null && !isGift ? Math.floor((total / 100) * earnRate) : 0;
  const unlocks = earn > 0 ? rewards.find((r) => r.point_cost > points && r.point_cost <= points + earn) ?? null : null;

  async function buy(method: "card" | FinancingMethod) {
    setBusy(method); setError(null);
    try {
      const res = await fetch(`/api/${slug}/shop/checkout`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity: qty, giftAmount: amount, recipientName: recipient, recipientNote: note, method }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("No connection. Please try again.");
    }
    setBusy(null);
  }

  const bannerTitle = unlocks ? "This purchase unlocks a new reward!" : earn > 0 ? `Earn ${earn.toLocaleString("en-US")} points with this purchase` : null;
  const bannerSub = unlocks ? unlocks.name : earn > 0 ? (takesCards ? "They land in your Rewards right after you pay." : "They land in your Rewards when you pay at the desk.") : pickupNote || null;

  return (
    <>
      {(item.kind === "product" || isGift) && (
        <section className="mx-4 rounded-[14px] bg-[#F4F5F6] p-4">
          {item.kind === "product" && (
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold">Quantity</p>
              <div className="flex items-center gap-1 rounded-full bg-white p-1">
                <button type="button" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
                  className="grid h-9 w-9 place-items-center rounded-full bg-page text-[20px] disabled:opacity-40">−</button>
                <span className="w-9 text-center text-[16px] font-semibold tabular-nums">{qty}</span>
                <button type="button" aria-label="More" onClick={() => setQty((q) => Math.min(10, q + 1))} disabled={qty >= 10}
                  className="grid h-9 w-9 place-items-center rounded-full bg-page text-[20px] disabled:opacity-40">+</button>
              </div>
            </div>
          )}
          {isGift && (
            <>
              <p className="text-[15px] font-semibold">Amount</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {item.amounts.map((a) => (
                  <button key={a} type="button" onClick={() => setAmount(a)}
                    className={`h-12 rounded-[12px] text-[15.5px] font-semibold transition ${amount === a ? "bg-black text-white" : "bg-white text-ink"}`}>
                    {priceLabel(a)}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-[15px] font-semibold">Who&apos;s it for? <span className="font-normal text-faint">(optional)</span></p>
              <input className="field mt-2" placeholder="Their name" value={recipient} maxLength={80} onChange={(e) => setRecipient(e.target.value)} />
              <textarea className="field mt-2 h-24 resize-none py-3" placeholder="Add a note" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
              <p className="mt-2 text-[13px] text-faint">You&apos;ll get a gift code in My purchases to share with them.</p>
            </>
          )}
        </section>
      )}

      <section className="sticky z-20 mt-4 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.2rem + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" className="btn-ink" disabled={total == null} onClick={() => require(() => setCart(true))}>
          {takesCards ? "Add to cart" : "Reserve"}{total != null ? ` · ${priceLabel(total)}` : ""}
        </button>
      </section>

      {cart && total != null && (
        <Portal>
          <div role="dialog" aria-modal aria-label="Shopping cart" className="fixed inset-0 z-[55] mx-auto flex max-w-md animate-rise flex-col bg-white">
            <header className="grid h-[54px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4" style={{ paddingTop: "env(safe-area-inset-top, 0px)", boxSizing: "content-box" }}>
              <button type="button" onClick={() => setCart(false)} className="flex items-center gap-0.5 justify-self-start text-[13px] font-medium text-sub"><IcBack className="h-4 w-4" strokeWidth={2} />Back</button>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Shopping Cart</h2>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <div className="flex gap-3.5 py-3">
                <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-page">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedUrl(image, 160)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="pill-soft">{item.kind === "package" ? "Package" : isGift ? "Gift card" : "Product"}</span>
                  <p className="mt-1 text-[15px] font-medium leading-snug">{itemName}{count > 1 ? ` × ${count}` : ""}</p>
                  <p className="mt-0.5 text-[14px] font-semibold">{priceLabel(total)}</p>
                </div>
              </div>

              {bannerTitle ? (
                <div className="mt-2 flex items-center gap-3 rounded-[12px] bg-[#EEF0F1] px-3.5 py-3">
                  <IcGift className="h-[22px] w-[22px] shrink-0" />
                  <span className="min-w-0"><span className="block text-[13.5px] font-semibold leading-tight">{bannerTitle}</span>{bannerSub && <span className="mt-0.5 block text-[12px] text-sub">{bannerSub}</span>}</span>
                </div>
              ) : pickupNote ? (
                <div className="mt-2 flex items-center gap-3 rounded-[12px] bg-[#EEF0F1] px-3.5 py-3"><IcGift className="h-[22px] w-[22px] shrink-0" /><span className="text-[13.5px] leading-snug">{pickupNote}</span></div>
              ) : null}

              <h3 className="mt-6 text-[16px] font-semibold">Summary</h3>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Order summary</p>
              <div className="mt-1.5 flex justify-between gap-4 rounded-[10px] bg-[#F4F5F6] px-3.5 py-3 text-[14px]"><span className="min-w-0">{itemName}{count > 1 ? ` × ${count}` : ""}</span><span className="shrink-0 font-medium">{priceLabel(total)}</span></div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Order total</p>
              <div className="mt-1.5 flex justify-between gap-4 rounded-[10px] bg-[#F4F5F6] px-3.5 py-3 text-[14px] font-semibold"><span>Order total</span><span>{priceLabel(total)}</span></div>
              {error && <p className="mt-3 text-center text-[13.5px] text-red-600">{error}</p>}
            </div>

            <div className="shrink-0 space-y-2 border-t border-line bg-white px-4 pt-3" style={{ paddingBottom: "calc(0.9rem + env(safe-area-inset-bottom, 0px))" }}>
              <button type="button" className="btn-ink" disabled={!!busy} onClick={() => buy("card")}>
                {busy === "card" ? (takesCards ? "Opening secure checkout…" : "Reserving…") : takesCards ? "Checkout now" : "Reserve"}
              </button>
              {payLater.map((m) => (
                <button key={m} type="button" className="btn-ghost" disabled={!!busy} onClick={() => buy(m)}>
                  {busy === m ? "Opening…" : `Pay over time with ${FINANCING_LIMITS[m].label}`}
                </button>
              ))}
              <p className="text-center text-[12px] text-faint">
                {takesCards ? "Card, Apple Pay or Google Pay · Secure checkout by Stripe" : "Nothing to pay now. Pay at the front desk on your next visit."}
              </p>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
