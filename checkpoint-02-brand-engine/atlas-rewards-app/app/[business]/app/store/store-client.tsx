"use client";
/**
 * StoreClient — CP-190 · the med spa Shop tab (Dermis "Shop" pattern)
 * Segments: Treatments (packages) · Membership · Skincare · Gift cards · Mine.
 * Buying opens a sheet; "Buy" goes to Stripe on the practice's account, or
 * reserves to pay at the desk when the practice isn't taking cards online.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Gift, Loader2, Minus, Package, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import type { Business } from "@/lib/types/database";
import { cents, shopPrice, type MedspaShop, type MedspaShopItem, type MedspaTreatment, type ShopOrderRow } from "@/lib/medspa";

type Seg = "packages" | "membership" | "products" | "gifts" | "mine";

export function StoreClient({ business, shop, treatments, orders, isMember, payOnline, initialTab, flash, membership }: {
  business: Business; shop: MedspaShop; treatments: MedspaTreatment[]; orders: ShopOrderRow[]; isMember: boolean; payOnline: boolean;
  initialTab: string | null; flash: "paid" | "cancelled" | null; membership: React.ReactNode;
}) {
  const { primary, secondary } = business.brand_colors;
  const items = shop.items.filter((i) => i.is_active);
  const by = (k: MedspaShopItem["kind"]) => items.filter((i) => i.kind === k);
  const mine = orders.filter((o) => o.status !== "pending");
  const segs: { id: Seg; label: string; show: boolean }[] = [
    { id: "packages", label: "Treatments", show: by("package").length > 0 },
    { id: "membership", label: "Membership", show: !!membership },
    { id: "products", label: "Skincare", show: by("product").length > 0 },
    { id: "gifts", label: "Gift cards", show: by("gift_card").length > 0 },
    { id: "mine", label: `Mine${mine.length ? ` · ${mine.length}` : ""}`, show: mine.length > 0 },
  ];
  const visible = segs.filter((s) => s.show);
  const [seg, setSeg] = useState<Seg>(() => (visible.find((s) => s.id === initialTab)?.id ?? (flash ? "mine" : visible[0]?.id ?? "membership")));
  const [open, setOpen] = useState<MedspaShopItem | null>(null);
  const tName = useMemo(() => new Map(treatments.map((t) => [t.id, t.name])), [treatments]);

  if (!shop.enabled) {
    return (
      <div className="px-4 pb-8 pt-5">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--surf-fg, #18181b)" }}>Shop</h1>
        <div className="mt-4 rounded-2xl border bg-white p-5 text-center">
          <ShoppingBag className="mx-auto h-8 w-8" style={{ color: primary }} />
          <div className="mt-2 font-bold text-zinc-900">The shop is opening soon</div>
          <p className="mt-1 text-sm text-zinc-500">{business.name} is setting up packages and skincare. In the meantime, the membership is below.</p>
        </div>
        {membership && <div className="mt-4">{membership}</div>}
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--surf-fg, #18181b)" }}>Shop</h1>
        {shop.intro && <p className="mt-0.5 text-sm text-zinc-500">{shop.intro}</p>}
      </div>

      {flash && (
        <div className={cn("mx-4 mt-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold", flash === "paid" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-zinc-100 text-zinc-700")}>
          {flash === "paid" ? <><CheckCircle2 className="h-4 w-4" />Paid. It&apos;s in Mine below and the front desk can see it.</> : <>Checkout cancelled. Nothing was charged.</>}
        </div>
      )}

      {/* Segments (Dermis: Browse · Anaya+ · Treatments) */}
      <div className="sticky top-0 z-10 mt-3 border-b bg-[var(--surf-bg,#f4f4f5)]/95 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visible.map((s) => (
            <button key={s.id} type="button" onClick={() => setSeg(s.id)} className={cn("relative shrink-0 px-3 py-3 text-sm font-semibold transition-colors", seg === s.id ? "text-zinc-900" : "text-zinc-400")}>
              {s.label}
              {seg === s.id && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full" style={{ background: primary }} />}
            </button>
          ))}
        </div>
      </div>

      {seg === "membership" && <div className="mt-4">{membership}</div>}

      {(seg === "packages" || seg === "products" || seg === "gifts") && (
        <div className="mt-4 grid grid-cols-2 gap-3 px-4">
          {by(seg === "packages" ? "package" : seg === "products" ? "product" : "gift_card").map((it) => {
            const price = it.kind === "gift_card" ? (it.amounts[0] ?? null) : shopPrice(it, isMember);
            return (
              <button key={it.id} type="button" onClick={() => setOpen(it)} className={cn("overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 ring-black/5 active:scale-[0.98] transition", it.featured && seg !== "gifts" && "col-span-2")}>
                <div className={cn("relative", it.featured && seg !== "gifts" ? "aspect-[2/1]" : "aspect-square")} style={{ background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
                  {it.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={optimizedUrl(it.image_url, 600)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <div className="absolute inset-0 grid place-items-center text-white/85">{it.kind === "gift_card" ? <Gift className="h-10 w-10" /> : it.kind === "package" ? <Package className="h-10 w-10" /> : <Sparkles className="h-10 w-10" />}</div>}
                  {it.kind === "package" && it.sessions && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-zinc-900">{it.sessions} sessions</span>}
                </div>
                <div className="p-3.5">
                  <div className="text-[14px] font-bold leading-tight text-zinc-900">{it.name}</div>
                  {it.featured && it.description && seg !== "gifts" && <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{it.description}</div>}
                  <div className="mt-2 flex items-baseline gap-2">
                    {price != null ? <span className="text-[15px] font-extrabold" style={{ color: primary }}>{it.kind === "gift_card" ? `From ${cents(price)}` : cents(price)}</span> : <span className="text-xs font-semibold text-zinc-500">Ask at the desk</span>}
                    {it.kind !== "gift_card" && isMember && it.member_price_cents != null && it.price_cents != null && <span className="text-xs text-zinc-400 line-through">{cents(it.price_cents)}</span>}
                    {it.kind !== "gift_card" && !isMember && it.member_price_cents != null && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${primary}14`, color: primary }}>Members {cents(it.member_price_cents)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {seg === "mine" && (
        <div className="mt-4 space-y-3 px-4">
          {mine.map((o) => <OrderCard key={o.id} o={o} primary={primary} tName={tName} />)}
        </div>
      )}

      {open && <BuySheet item={open} business={business} isMember={isMember} payOnline={payOnline} tName={tName} onClose={() => setOpen(null)} />}
    </div>
  );
}

function OrderCard({ o, primary, tName }: { o: ShopOrderRow; primary: string; tName: Map<string, string> }) {
  const status = o.status === "reserved" ? "Pay at the desk" : o.status === "paid" ? (o.kind === "product" ? "Paid · ready at the desk" : "Paid") : o.status === "fulfilled" ? (o.kind === "product" ? "Picked up" : "Done") : o.status;
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-zinc-900">{o.item_name}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</div>
          <div className="text-xs text-zinc-500">{new Date(o.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {cents(o.amount_cents)}</div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", o.status === "reserved" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200")}>{status}</span>
      </div>
      {o.kind === "package" && o.sessions_total ? (
        <div className="mt-3">
          <div className="flex justify-between text-xs font-semibold text-zinc-600"><span>{o.treatment_id ? tName.get(o.treatment_id) ?? "Sessions" : "Sessions"}</span><span>{o.sessions_total - o.sessions_used} of {o.sessions_total} left</span></div>
          <div className="mt-1.5 flex gap-1">{Array.from({ length: o.sessions_total }, (_, k) => <span key={k} className="h-2 flex-1 rounded-full" style={{ background: k < o.sessions_used ? "#e4e4e7" : primary }} />)}</div>
        </div>
      ) : null}
      {o.kind === "gift_card" && o.gift_code && (
        <div className="mt-3 rounded-2xl border border-dashed p-3 text-center" style={{ borderColor: `${primary}55` }}>
          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Gift code{o.recipient_name ? ` · for ${o.recipient_name}` : ""}</div>
          <div className="mt-1 font-mono text-xl font-extrabold tracking-widest text-zinc-900">{o.gift_code}</div>
          <div className="mt-1 text-xs text-zinc-500">Balance {cents(o.gift_balance_cents ?? 0)}{o.status === "reserved" ? " · active once paid at the desk" : ""}</div>
        </div>
      )}
    </div>
  );
}

function BuySheet({ item, business, isMember, payOnline, tName, onClose }: { item: MedspaShopItem; business: Business; isMember: boolean; payOnline: boolean; tName: Map<string, string>; onClose: () => void }) {
  const { primary } = business.brand_colors;
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState<number | null>(item.kind === "gift_card" ? item.amounts[0] ?? null : null);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reserved, setReserved] = useState(false);
  const unit = shopPrice(item, isMember, amount);
  const total = unit != null ? unit * (item.kind === "product" ? qty : 1) : null;

  async function buy() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/${business.slug}/shop/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity: qty, giftAmount: amount, recipientName: recipient, recipientNote: note, returnUrl: window.location.href }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      if (j.url) { window.location.href = j.url; return; }
      setReserved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={item.name}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold leading-tight text-zinc-900">{item.name}</div>
            {item.kind === "package" && <div className="mt-0.5 text-xs font-semibold" style={{ color: primary }}>{item.sessions} sessions{item.treatment_id && tName.get(item.treatment_id) ? ` of ${tName.get(item.treatment_id)}` : ""}</div>}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {item.description && <p className="mt-2 text-sm text-zinc-600">{item.description}</p>}

        {reserved ? (
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" />Reserved for you</div>
            <p className="mt-1">Pay at the front desk on your next visit. It&apos;s under Mine in the Shop, and the desk can see it.</p>
            <button type="button" onClick={() => window.location.assign(`${window.location.pathname}?tab=mine`)} className="mt-3 inline-flex items-center gap-1 font-bold" style={{ color: primary }}>See it in Mine <ChevronRight className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            {item.kind === "gift_card" && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {item.amounts.map((a) => <button key={a} type="button" onClick={() => setAmount(a)} className={cn("rounded-xl border py-3 text-sm font-bold", amount === a ? "text-white" : "bg-white text-zinc-800")} style={amount === a ? { background: primary, borderColor: primary } : undefined}>{cents(a)}</button>)}
                </div>
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Who's it for? (optional)" className="h-11 w-full rounded-xl border px-3 text-sm" />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for them (optional)" rows={2} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>
            )}
            {item.kind === "product" && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-50 p-3">
                <span className="text-sm font-semibold text-zinc-700">Quantity</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-black/10"><Minus className="h-4 w-4" /></button>
                  <span className="w-5 text-center font-bold">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(10, q + 1))} className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-black/10"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            )}
            {item.kind === "product" && item.pickup_note && <p className="mt-2 text-xs text-zinc-500">{item.pickup_note}</p>}
            {item.kind === "package" && <p className="mt-3 text-xs text-zinc-500">Sessions are tracked in your app. The front desk marks one used each visit.</p>}
            {isMember && item.member_price_cents != null && item.kind !== "gift_card" && <p className="mt-3 text-xs font-semibold" style={{ color: primary }}>Member price applied.</p>}

            {err && <p className="mt-3 text-sm text-rose-600" role="alert">{err}</p>}
            <button type="button" disabled={busy || total == null} onClick={buy} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: primary }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {total == null ? "Ask the front desk" : payOnline ? `Buy · ${cents(total)}` : `Reserve · pay ${cents(total)} at the desk`}
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-400">{payOnline ? `Secure checkout. Payment goes to ${business.name}.` : "Nothing is charged now."}</p>
          </>
        )}
      </div>
    </div>
  );
}
