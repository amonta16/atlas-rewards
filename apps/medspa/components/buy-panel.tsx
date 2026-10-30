"use client";
/**
 * Buy a Shop item: quantity (skincare), amount + who it's for (gift cards),
 * then card / Apple Pay / Google Pay, or pay over time (Klarna / Affirm)
 * when the clinic offers it. Clinics without Stripe get "Reserve" and pay
 * at the desk. Guests hit the sign-in prompt first.
 */
import { useState } from "react";
import { financingFits, FINANCING_LIMITS, type FinancingMethod, type MedspaShopItem } from "@/lib/medspa";
import { priceLabel } from "@/lib/plans";
import { useGate } from "./gate";

type Props = {
  slug: string;
  item: Pick<MedspaShopItem, "id" | "kind" | "amounts" | "price_cents" | "member_price_cents">;
  isMember: boolean;
  takesCards: boolean;
  financing: { klarna: boolean; affirm: boolean };
};

export function BuyPanel({ slug, item, isMember, takesCards, financing }: Props) {
  const { require } = useGate();
  const isGift = item.kind === "gift_card";
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState<number | null>(isGift ? item.amounts[1] ?? item.amounts[0] ?? null : null);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unit = isGift ? amount : (isMember && item.member_price_cents ? item.member_price_cents : item.price_cents);
  const total = unit != null ? unit * (item.kind === "product" ? qty : 1) : null;
  const payLater = takesCards && total != null
    ? (["klarna", "affirm"] as FinancingMethod[]).filter((m) => financing[m] && financingFits(m, total))
    : [];

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

  return (
    <>
      {(item.kind === "product" || isGift) && (
        <section className="mx-4 -mt-3 rounded-card bg-white p-5 shadow-card">
          {item.kind === "product" && (
            <div className="flex items-center justify-between">
              <p className="text-[15.5px] font-semibold">Quantity</p>
              <div className="flex items-center gap-1 rounded-full bg-page p-1">
                <button type="button" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-[20px] shadow-card disabled:opacity-40">−</button>
                <span className="w-9 text-center text-[17px] font-semibold tabular-nums">{qty}</span>
                <button type="button" aria-label="More" onClick={() => setQty((q) => Math.min(10, q + 1))} disabled={qty >= 10}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-[20px] shadow-card disabled:opacity-40">+</button>
              </div>
            </div>
          )}
          {isGift && (
            <>
              <p className="text-[15.5px] font-semibold">Amount</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {item.amounts.map((a) => (
                  <button key={a} type="button" onClick={() => setAmount(a)}
                    className={`h-12 rounded-[14px] text-[16px] font-semibold transition ${amount === a ? "bg-ink text-white" : "bg-page text-ink"}`}>
                    {priceLabel(a)}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-[15.5px] font-semibold">Who&apos;s it for? <span className="font-normal text-faint">(optional)</span></p>
              <input className="field mt-2" placeholder="Their name" value={recipient} maxLength={80} onChange={(e) => setRecipient(e.target.value)} />
              <textarea className="field mt-2 h-24 resize-none py-3" placeholder="Add a note" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
              <p className="mt-2 text-[13px] text-faint">You&apos;ll get a gift code in My purchases to share with them.</p>
            </>
          )}
        </section>
      )}

      <section className="sticky z-20 mt-6 space-y-2.5 bg-gradient-to-t from-page via-page to-page/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.6rem + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" className="btn-ink" disabled={!!busy || total == null} onClick={() => require(() => buy("card"))}>
          {busy === "card" ? (takesCards ? "Opening secure checkout…" : "Reserving…")
            : takesCards ? `Buy now${total != null ? ` · ${priceLabel(total)}` : ""}` : `Reserve${total != null ? ` · ${priceLabel(total)}` : ""}`}
        </button>
        {payLater.map((m) => (
          <button key={m} type="button" className="btn-ghost" disabled={!!busy} onClick={() => require(() => buy(m))}>
            {busy === m ? "Opening…" : `Pay over time with ${FINANCING_LIMITS[m].label}`}
          </button>
        ))}
        {error && <p className="text-center text-[13.5px] text-red-600">{error}</p>}
        <p className="text-center text-[12.5px] text-faint">
          {takesCards ? "Card, Apple Pay or Google Pay · Secure checkout by Stripe" : "Nothing to pay now. Pay at the front desk on your next visit."}
        </p>
      </section>
    </>
  );
}
