"use client";
/**
 * MedspaShopClient — CP-193 · the Shop tab's screens (client side)
 *
 *   Browse      packages, skincare, gift cards
 *   Membership  the practice's membership (join / pending / member)
 *   Treatments  the menu with member prices, Book
 *   Orders      via the bag icon (?tab=mine)
 *   Checkout    full screen: total, Card / wallet / Klarna, Place order
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAppBase } from "@/lib/use-app-base";
import { optimizedUrl } from "@/lib/img";
import { cents, shopPrice, weeksLabel, SHOP_KIND_LABEL, type MedspaShop, type MedspaShopItem, type MedspaTreatment, type ShopOrderRow } from "@/lib/medspa";
import { joinFinePrint, money, type MembershipOffer } from "@/lib/membership";
import type { MsMembership } from "@/lib/medspa-app/data";
import type { Business } from "@/lib/types/database";
import { ManageMembership } from "@/components/customer/manage-membership";
import { MsTopBar } from "./chrome";
import { IcBag, IcCard, IcCheck, IcClose, IcGift, IcSparkle } from "./icons";

type Tab = "browse" | "membership" | "treatments" | "mine";
type Flash = "paid" | "cancelled" | null;

export function MedspaShopClient({ business, userId, membershipId, shop, treatments, orders, membershipInfo: ms, payOnline, canBook, bagCount, initial }: {
  business: Business; userId: string; membershipId: string | null; shop: MedspaShop; treatments: MedspaTreatment[];
  orders: ShopOrderRow[]; membershipInfo: MsMembership; payOnline: boolean; canBook: boolean; bagCount: number;
  initial: { tab: string | null; item: string | null; flash: Flash };
}) {
  const items = useMemo(() => (shop.enabled ? shop.items.filter((i) => i.is_active) : []), [shop]);
  const hasMembership = ms.view.enabled && (ms.isPaid || ms.isPending || ms.view.purchasable);
  const tabs: { id: Tab; label: string }[] = [
    { id: "browse", label: "Browse" },
    ...(hasMembership ? [{ id: "membership" as Tab, label: ms.view.name }] : []),
    { id: "treatments", label: "Treatments" },
  ];
  const pick = (t: string | null): Tab => (t === "mine" ? "mine" : tabs.find((x) => x.id === t)?.id ?? (initial.flash ? "mine" : "browse"));
  const [tab, setTab] = useState<Tab>(() => pick(initial.tab));
  const [sheet, setSheet] = useState<MedspaShopItem | null>(() => items.find((i) => i.id === initial.item) ?? null);
  const [checkout, setCheckout] = useState<{ item: MedspaShopItem; qty: number; amount: number | null; recipient: string; note: string } | null>(null);
  const isMember = ms.isPaid;
  const slug = business.slug;

  // Checkout and Your orders are pushed screens: open them at the top.
  useEffect(() => { if (checkout || tab === "mine") window.scrollTo({ top: 0 }); }, [checkout, tab]);

  // Keep ?tab in the URL so Back and refresh land on the same tab.
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("tab", tab); u.searchParams.delete("item"); u.searchParams.delete("paid"); u.searchParams.delete("cancelled"); u.searchParams.delete("order");
    window.history.replaceState({}, "", u.toString());
  }, [tab]);

  if (checkout) {
    return <Checkout business={business} line={checkout} isMember={isMember} payOnline={payOnline} onBack={() => { setCheckout(null); setSheet(checkout.item); }} onReserved={() => { setCheckout(null); setTab("mine"); }} />;
  }

  if (tab === "mine") {
    return (
      <div className="min-h-[70vh] bg-[var(--ms-bg)]">
        <MsTopBar slug={slug} title="Your orders" onBack={() => setTab("browse")} />
        {initial.flash && (
          <div className="mx-5 mt-4 rounded-2xl px-4 py-3 text-[15px]" style={initial.flash === "paid" ? { background: "color-mix(in srgb, var(--ms-p) 10%, #fff)", color: "var(--ms-ink)" } : { background: "#fff", color: "var(--ms-sub)" }}>
            {initial.flash === "paid" ? "Payment received. Your order is below and the front desk can see it." : "Checkout cancelled. Nothing was charged."}
          </div>
        )}
        <div className="space-y-3 px-5 pt-4">
          {orders.length === 0
            ? <Empty icon={<IcBag className="h-8 w-8" />} title="No orders yet" body="Packages, skincare and gift cards you buy will show up here." />
            : orders.map((o) => <OrderCard key={o.id} o={o} tName={new Map(treatments.map((t) => [t.id, t.name]))} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--ms-bg)]">
      <div className="sticky top-0 z-30 bg-white">
        <MsTopBar slug={slug} title="Shop" bagCount={bagCount} />
        <div role="tablist" className="grid border-b border-[var(--ms-line)]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)}
              className="relative truncate px-2 pb-3.5 pt-1 text-[18px] transition-colors"
              style={{ color: tab === t.id ? "var(--ms-ink)" : "var(--ms-sub)", fontWeight: tab === t.id ? 500 : 400 }}>
              {t.label}
              <span className="absolute inset-x-0 -bottom-px h-[3px] transition-opacity" style={{ background: "var(--ms-p)", opacity: tab === t.id ? 1 : 0 }} />
            </button>
          ))}
        </div>
      </div>

      {tab === "browse" && <Browse items={items} shopOpen={shop.enabled} intro={shop.intro} isMember={isMember} onOpen={setSheet} />}
      {tab === "membership" && <MembershipTab business={business} ms={ms} userId={userId} membershipId={membershipId} />}
      {tab === "treatments" && <Treatments treatments={treatments} isMember={isMember} canBook={canBook} slug={slug} packages={items.filter((i) => i.kind === "package")} onOpen={setSheet} />}

      {sheet && (
        <ItemSheet item={sheet} isMember={isMember} payOnline={payOnline} treatments={treatments}
          onClose={() => setSheet(null)}
          onContinue={(line) => { setSheet(null); setCheckout({ item: sheet, ...line }); }} />
      )}
    </div>
  );
}

/* ───────────────────────── Browse ───────────────────────── */

function Browse({ items, shopOpen, intro, isMember, onOpen }: { items: MedspaShopItem[]; shopOpen: boolean; intro: string; isMember: boolean; onOpen: (i: MedspaShopItem) => void }) {
  if (!shopOpen || items.length === 0) {
    return <div className="px-5 pt-6"><Empty icon={<IcBag className="h-8 w-8" />} title="The shop opens soon" body="Packages, skincare and gift cards will be here. The membership and treatment menu are in the tabs above." /></div>;
  }
  const lead = items.find((i) => i.featured && i.kind === "package") ?? null;
  const kinds = (["package", "product", "gift_card"] as const).filter((k) => items.some((i) => i.kind === k && i !== lead));
  return (
    <div className="pb-6">
      {lead && (
        <button type="button" onClick={() => onOpen(lead)} className="block w-full text-left">
          <div className="relative aspect-[16/10] w-full" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--ms-p) 22%, #fff), color-mix(in srgb, var(--ms-p) 55%, #fff))" }}>
            {lead.image_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={optimizedUrl(lead.image_url, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              : <span className="absolute inset-0 grid place-items-center text-white"><IcSparkle className="h-14 w-14" /></span>}
          </div>
          <div className="px-5 pb-2 pt-6">
            <div className="text-[15px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ms-p)" }}>{lead.sessions ? `${lead.sessions} sessions` : "Featured"}</div>
            <div className="mt-1.5 text-[30px] font-semibold leading-[1.15] tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>{lead.name}</div>
            {lead.description && <p className="mt-2 text-[17px] leading-[1.5]" style={{ color: "var(--ms-sub)" }}>{lead.description}</p>}
            <Price item={lead} isMember={isMember} big />
          </div>
        </button>
      )}
      {!lead && intro && <p className="px-5 pt-5 text-[16px] leading-relaxed" style={{ color: "var(--ms-sub)" }}>{intro}</p>}
      {kinds.map((k) => (
        <section key={k} className="pt-7">
          <h2 className="px-5 text-[24px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ms-ink)" }}>{SHOP_KIND_LABEL[k]}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 px-5">
            {items.filter((i) => i.kind === k && i !== lead).map((it) => (
              <button key={it.id} type="button" onClick={() => onOpen(it)} className="overflow-hidden rounded-[18px] bg-white text-left ring-1 ring-[var(--ms-line)] active:scale-[.98] transition">
                <div className="relative aspect-square" style={{ background: "color-mix(in srgb, var(--ms-p) 9%, #fff)" }}>
                  {it.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={optimizedUrl(it.image_url, 420)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <span className="absolute inset-0 grid place-items-center" style={{ color: "var(--ms-p)" }}>{it.kind === "gift_card" ? <IcGift className="h-9 w-9" /> : <IcSparkle className="h-9 w-9" />}</span>}
                  {it.kind === "package" && it.sessions ? <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold" style={{ color: "var(--ms-ink)" }}>{it.sessions} sessions</span> : null}
                </div>
                <div className="p-3.5">
                  <div className="line-clamp-2 text-[15.5px] font-semibold leading-snug" style={{ color: "var(--ms-ink)" }}>{it.name}</div>
                  <Price item={it} isMember={isMember} />
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Price({ item, isMember, big }: { item: MedspaShopItem; isMember: boolean; big?: boolean }) {
  const price = item.kind === "gift_card" ? item.amounts[0] ?? null : shopPrice(item, isMember);
  if (price == null) return <div className={`${big ? "mt-4 text-[17px]" : "mt-1 text-[14px]"}`} style={{ color: "var(--ms-sub)" }}>Ask at the desk</div>;
  const showMember = item.kind !== "gift_card" && item.member_price_cents != null && item.price_cents != null;
  return (
    <div className={`${big ? "mt-4" : "mt-1"} flex flex-wrap items-baseline gap-x-2`}>
      <span className={big ? "text-[32px] font-semibold tracking-[-0.02em]" : "text-[15px] font-semibold"} style={{ color: "var(--ms-ink)" }}>{item.kind === "gift_card" ? `From ${cents(price)}` : cents(price)}</span>
      {showMember && isMember && <span className="text-[14px] line-through" style={{ color: "var(--ms-icon)" }}>{cents(item.price_cents)}</span>}
      {showMember && !isMember && <span className="text-[13px]" style={{ color: "var(--ms-p)" }}>Members {cents(item.member_price_cents)}</span>}
    </div>
  );
}

/* ───────────────────────── Membership ───────────────────────── */

function MembershipTab({ business, ms, userId, membershipId }: { business: Business; ms: MsMembership; userId: string; membershipId: string | null }) {
  const router = useRouter();
  const v = ms.view;
  const [sel, setSel] = useState<string | null>(v.offers[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chosen: MembershipOffer | null = v.offers.find((o) => o.id === sel) ?? v.offers[0] ?? null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  async function join() {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      if (v.paymentMode === "stripe") {
        const res = await fetch(`/api/${business.slug}/membership/checkout`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, membershipId, returnUrl: window.location.href, passId: chosen.kind === "pass" ? chosen.id : null }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.url) throw new Error(j.error ?? "Couldn't start checkout.");
        window.location.assign(j.url);
        return;
      }
      const { error } = await createClient().rpc("request_membership_v2", { p_business_id: business.id, p_pass_id: chosen.kind === "pass" ? chosen.id : null });
      if (error) throw new Error(error.message);
      if (v.paymentMode === "external_link" && v.externalUrl) window.open(v.externalUrl, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const perks = [
    ...(v.pointsMultiplier > 1 ? [`${v.pointsMultiplier % 1 === 0 ? v.pointsMultiplier.toFixed(0) : v.pointsMultiplier.toFixed(1)}× points on every visit`] : []),
    ...(v.priorityBooking ? ["Priority booking"] : []),
    ...v.perks,
  ];
  const eyebrow = ms.isPaid ? "Your membership" : ms.isPending ? "Requested" : `Try ${v.name}`;
  const headline = ms.isPaid ? `Welcome to ${v.name}` : ms.isPending ? "Almost there" : "Made for regulars";
  const blurb = ms.isPaid
    ? [ms.paidAt ? `Member since ${fmt(ms.paidAt)}.` : "", ms.renewsAt ? `Renews ${fmt(ms.renewsAt)}.` : ""].filter(Boolean).join(" ") || "Your perks are below."
    : ms.isPending
      ? v.paymentMode === "external_link" ? "Finish paying on the practice's page. Your membership switches on here once they see it." : `Pay at the front desk on your next visit and they'll switch it on.${v.instructions ? ` ${v.instructions}` : ""}`
      : perks.length ? `Members get ${perks.slice(0, 2).map((p) => p.charAt(0).toLowerCase() + p.slice(1)).join(" and ")}${perks.length > 2 ? ", and more" : ""}.` : `Join ${v.name} at ${business.name}.`;

  return (
    <div className="pb-6">
      <div className="relative aspect-[16/10] w-full" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--ms-p) 25%, #fff), color-mix(in srgb, var(--ms-p) 70%, #fff))" }}>
        {ms.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={optimizedUrl(ms.imageUrl, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="px-5 pb-7 pt-7">
        <div className="text-[16px] font-medium uppercase tracking-[0.05em]" style={{ color: "var(--ms-p)" }}>{eyebrow}</div>
        <h2 className="mt-2 text-[34px] font-semibold leading-[1.12] tracking-[-0.02em]" style={{ color: "var(--ms-ink)" }}>{headline}</h2>
        <p className="mt-3 text-[18px] leading-[1.55]" style={{ color: "var(--ms-sub)" }}>{blurb}</p>
        {!ms.isPaid && !ms.isPending && chosen && (
          <div className="mt-5 flex items-baseline gap-1" style={{ color: "var(--ms-ink)" }}>
            <span className="text-[34px] font-semibold tracking-[-0.02em]">{money(chosen.priceCents)}</span>
            <span className="text-[16px]">{chosen.kind === "monthly" ? "/mo" : ` for ${chosen.months} month${chosen.months === 1 ? "" : "s"}`}</span>
          </div>
        )}
        {ms.isPending && v.paymentMode === "external_link" && v.externalUrl && (
          <a href={v.externalUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-12 items-center rounded-2xl px-6 text-[16px] font-semibold text-white" style={{ background: "var(--ms-p)" }}>Finish payment</a>
        )}
      </div>

      {perks.length > 0 && (
        <section className="bg-[var(--ms-tint)] px-5 pb-8 pt-8">
          <h3 className="text-center text-[28px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>{ms.isPaid ? "Your benefits" : "Membership benefits"}</h3>
          <ul className="mt-5 space-y-2.5">
            {perks.map((p, i) => (
              <li key={i} className="flex items-center gap-3.5 rounded-2xl bg-white px-4 py-4 text-[17px]" style={{ color: "var(--ms-ink)" }}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}><IcCheck className="h-[18px] w-[18px]" strokeWidth={2.2} /></span>
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ms.isPaid && <div className="pt-2"><ManageMembership business={business} /></div>}

      {!ms.isPaid && !ms.isPending && v.purchasable && (
        <div className="px-5 pt-7">
          {v.offers.length > 1 && (
            <div className="mb-4 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(v.offers.length, 2)}, minmax(0,1fr))` }}>
              {v.offers.map((o) => {
                const on = chosen?.id === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setSel(o.id)} className="rounded-2xl bg-white p-4 text-left transition" style={{ boxShadow: on ? "inset 0 0 0 2px var(--ms-p)" : "inset 0 0 0 1px var(--ms-line)" }}>
                    <div className="text-[14px]" style={{ color: "var(--ms-sub)" }}>{o.kind === "monthly" ? "Monthly" : o.label}</div>
                    <div className="mt-0.5 text-[22px] font-semibold" style={{ color: "var(--ms-ink)" }}>{money(o.priceCents)}<span className="text-[14px] font-normal">{o.kind === "monthly" ? "/mo" : ""}</span></div>
                  </button>
                );
              })}
            </div>
          )}
          {err && <p className="mb-3 text-[15px] text-rose-600" role="alert">{err}</p>}
          <button type="button" onClick={join} disabled={busy || !chosen} className="h-14 w-full rounded-2xl text-[17px] font-semibold text-white transition active:scale-[.99] disabled:opacity-60" style={{ background: "var(--ms-p)" }}>
            {busy ? "One moment…" : v.paymentMode === "in_person" ? "Reserve at the front desk" : chosen?.kind === "monthly" ? `Join for ${money(chosen.priceCents)}/mo` : `Buy for ${money(chosen?.priceCents ?? 0)}`}
          </button>
          <p className="mt-2.5 text-center text-[13px]" style={{ color: "var(--ms-icon)" }}>{joinFinePrint(v, chosen)}</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Treatments ───────────────────────── */

function Treatments({ treatments, isMember, canBook, slug, packages, onOpen }: { treatments: MedspaTreatment[]; isMember: boolean; canBook: boolean; slug: string; packages: MedspaShopItem[]; onOpen: (i: MedspaShopItem) => void }) {
  const base = useAppBase(slug);
  if (treatments.length === 0) return <div className="px-5 pt-6"><Empty icon={<IcSparkle className="h-8 w-8" />} title="Menu coming soon" body="The treatment menu will be listed here." /></div>;
  const groups = [...new Set(treatments.map((t) => t.category))];
  return (
    <div className="pb-6">
      {groups.map((g) => (
        <section key={g} className="pt-6">
          <h2 className="px-5 text-[24px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ms-ink)" }}>{g}</h2>
          <div className="mt-3 space-y-2.5 px-5">
            {treatments.filter((t) => t.category === g).map((t) => {
              const pack = packages.find((p) => p.treatment_id === t.id);
              const price = isMember && t.member_price_cents ? t.member_price_cents : t.price_cents;
              return (
                <div key={t.id} className="flex gap-3.5 rounded-[18px] bg-white p-3 ring-1 ring-[var(--ms-line)]">
                  <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl" style={{ background: "color-mix(in srgb, var(--ms-p) 10%, #fff)" }}>
                    {t.image_url
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={optimizedUrl(t.image_url, 200)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      : <span className="absolute inset-0 grid place-items-center" style={{ color: "var(--ms-p)" }}><IcSparkle className="h-7 w-7" /></span>}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="text-[17px] font-semibold leading-snug" style={{ color: "var(--ms-ink)" }}>{t.name}</div>
                    <div className="mt-0.5 text-[14px]" style={{ color: "var(--ms-sub)" }}>{t.duration_minutes} min{t.recall_weeks ? ` · ${weeksLabel(t.recall_weeks).toLowerCase()}` : ""}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      {price != null && price > 0 ? <span className="text-[16px] font-semibold" style={{ color: "var(--ms-ink)" }}>{cents(price)}</span> : price === 0 ? <span className="text-[16px] font-semibold" style={{ color: "var(--ms-ink)" }}>Free</span> : null}
                      {!isMember && t.member_price_cents ? <span className="text-[13px]" style={{ color: "var(--ms-p)" }}>Members {cents(t.member_price_cents)}</span> : null}
                      <span className="ml-auto flex gap-2">
                        {pack && <button type="button" onClick={() => onOpen(pack)} className="h-9 rounded-full px-3.5 text-[14px] font-medium ring-1 ring-[var(--ms-line)]" style={{ color: "var(--ms-ink)" }}>Package</button>}
                        {canBook && <Link href={`${base}/book`} className="grid h-9 place-items-center rounded-full px-4 text-[14px] font-semibold text-white" style={{ background: "var(--ms-p)" }}>Book</Link>}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ───────────────────────── Item sheet ───────────────────────── */

function ItemSheet({ item, isMember, payOnline, treatments, onClose, onContinue }: {
  item: MedspaShopItem; isMember: boolean; payOnline: boolean; treatments: MedspaTreatment[];
  onClose: () => void; onContinue: (line: { qty: number; amount: number | null; recipient: string; note: string }) => void;
}) {
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState<number | null>(item.kind === "gift_card" ? item.amounts[0] ?? null : null);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const unit = shopPrice(item, isMember, amount);
  const total = unit != null ? unit * (item.kind === "product" ? qty : 1) : null;
  const tname = item.treatment_id ? treatments.find((t) => t.id === item.treatment_id)?.name : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,22,34,.42)]" onClick={onClose}>
      <div role="dialog" aria-label={item.name} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ animation: "ms-lift .28s ease-out both" }}>
        <div className="relative aspect-[16/10] w-full" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)" }}>
          {item.image_url
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={optimizedUrl(item.image_url, 800)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <span className="absolute inset-0 grid place-items-center" style={{ color: "var(--ms-p)" }}>{item.kind === "gift_card" ? <IcGift className="h-12 w-12" /> : <IcSparkle className="h-12 w-12" />}</span>}
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow" style={{ color: "var(--ms-ink)" }}><IcClose className="h-5 w-5" /></button>
        </div>
        <div className="px-5 pt-5">
          {item.kind === "package" && <div className="text-[15px] font-medium uppercase tracking-[0.05em]" style={{ color: "var(--ms-p)" }}>{item.sessions} sessions{tname ? ` of ${tname}` : ""}</div>}
          <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>{item.name}</h2>
          {item.description && <p className="mt-2 text-[16px] leading-[1.55]" style={{ color: "var(--ms-sub)" }}>{item.description}</p>}

          {item.kind === "gift_card" && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {item.amounts.map((a) => (
                  <button key={a} type="button" onClick={() => setAmount(a)} className="h-12 rounded-xl bg-white text-[16px] font-semibold" style={{ color: "var(--ms-ink)", boxShadow: amount === a ? "inset 0 0 0 2px var(--ms-p)" : "inset 0 0 0 1px var(--ms-line)" }}>{cents(a)}</button>
                ))}
              </div>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Who's it for? (optional)" className="h-12 w-full rounded-xl border border-[var(--ms-line)] px-4 text-[16px] outline-none focus:border-[var(--ms-p)]" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" rows={2} className="w-full rounded-xl border border-[var(--ms-line)] px-4 py-3 text-[16px] outline-none focus:border-[var(--ms-p)]" />
            </div>
          )}
          {item.kind === "product" && (
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-[var(--ms-bg)] p-3 pl-4">
              <span className="text-[16px]" style={{ color: "var(--ms-ink)" }}>Quantity</span>
              <div className="flex items-center gap-4">
                <button type="button" aria-label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[20px] ring-1 ring-[var(--ms-line)]">−</button>
                <span className="w-5 text-center text-[17px] font-semibold tabular-nums">{qty}</span>
                <button type="button" aria-label="One more" onClick={() => setQty((q) => Math.min(10, q + 1))} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[20px] ring-1 ring-[var(--ms-line)]">+</button>
              </div>
            </div>
          )}
          {item.kind === "product" && item.pickup_note && <p className="mt-2 text-[14px]" style={{ color: "var(--ms-sub)" }}>{item.pickup_note}</p>}
          {item.kind === "package" && <p className="mt-3 text-[14px]" style={{ color: "var(--ms-sub)" }}>Your sessions are tracked in the app. The front desk marks one off each visit.</p>}

          <button type="button" disabled={total == null} onClick={() => onContinue({ qty, amount, recipient, note })}
            className="mt-6 h-14 w-full rounded-2xl text-[17px] font-semibold text-white transition active:scale-[.99] disabled:opacity-50" style={{ background: "var(--ms-p)" }}>
            {total == null ? "Ask the front desk" : payOnline ? `Continue · ${cents(total)}` : `Reserve · ${cents(total)}`}
          </button>
          {isMember && item.member_price_cents != null && item.kind !== "gift_card" && <p className="mt-2 text-center text-[13px]" style={{ color: "var(--ms-p)" }}>Member price applied</p>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Checkout ───────────────────────── */

type Method = "card" | "wallet" | "klarna";

function Checkout({ business, line, isMember, payOnline, onBack, onReserved }: {
  business: Business; line: { item: MedspaShopItem; qty: number; amount: number | null; recipient: string; note: string };
  isMember: boolean; payOnline: boolean; onBack: () => void; onReserved: () => void;
}) {
  const { item, qty, amount } = line;
  const unit = shopPrice(item, isMember, amount);
  const total = unit != null ? unit * (item.kind === "product" ? qty : 1) : 0;
  const [method, setMethod] = useState<Method>("card");
  const [wallet, setWallet] = useState<"Apple Pay" | "Google Pay">("Google Pay");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) setWallet("Apple Pay"); }, []);

  async function place() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/${business.slug}/shop/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity: qty, giftAmount: amount, recipientName: line.recipient, recipientNote: line.note, returnUrl: window.location.href, method }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      if (j.url) { window.location.href = j.url; return; }
      onReserved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const tiles: { id: Method; label: string; mark: React.ReactNode }[] = [
    { id: "card", label: "Card", mark: <IcCard className="h-7 w-7" /> },
    { id: "wallet", label: wallet, mark: <span className="rounded-md bg-white px-1.5 py-0.5 text-[12px] font-semibold ring-1 ring-black/10" style={{ color: "#111" }}>{wallet === "Apple Pay" ? "Pay" : "G Pay"}</span> },
    { id: "klarna", label: "Klarna", mark: <span className="rounded-md px-1.5 py-0.5 text-[12px] font-bold" style={{ background: "#ffb3c7", color: "#17120f" }}>Klarna.</span> },
  ];

  return (
    <div className="min-h-[85vh] bg-[var(--ms-bg)]">
      <MsTopBar slug={business.slug} title="Checkout" onBack={onBack} />
      <div className="px-5 pt-6">
        <div className="text-[17px]" style={{ color: "var(--ms-sub)" }}>Order total</div>
        <div className="mt-1 text-[34px] font-semibold tracking-[-0.02em] tabular-nums" style={{ color: "var(--ms-ink)" }}>{cents(total)}</div>

        {payOnline && (
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {tiles.map((t) => {
              const on = method === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setMethod(t.id)} aria-pressed={on}
                  className="flex h-[104px] flex-col items-start justify-between rounded-2xl p-3.5 text-left transition"
                  style={{ background: on ? "color-mix(in srgb, var(--ms-p) 8%, #fff)" : "#fff", boxShadow: on ? "inset 0 0 0 2px var(--ms-p)" : "inset 0 0 0 1px #d9dce0", color: "var(--ms-ink)" }}>
                  <span style={{ color: "var(--ms-ink)" }}>{t.mark}</span>
                  <span className="text-[16px]">{t.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-[var(--ms-line)]">
          <div className="flex items-start justify-between gap-3 text-[16px]" style={{ color: "var(--ms-ink)" }}>
            <span className="min-w-0">{item.name}{item.kind === "product" && qty > 1 ? ` × ${qty}` : ""}{item.kind === "gift_card" && amount ? ` · ${cents(amount)}` : ""}</span>
            <span className="shrink-0 tabular-nums">{cents(total)}</span>
          </div>
          {isMember && item.member_price_cents != null && item.kind !== "gift_card" && <div className="mt-1 text-[14px]" style={{ color: "var(--ms-p)" }}>Member price applied</div>}
          {item.kind === "gift_card" && line.recipient && <div className="mt-1 text-[14px]" style={{ color: "var(--ms-sub)" }}>For {line.recipient}</div>}
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#e9ebee] px-4 py-3.5">
          <IcGift className="h-6 w-6 shrink-0" style={{ color: "var(--ms-ink)" }} />
          <div className="text-[14.5px] leading-snug" style={{ color: "var(--ms-ink)" }}>
            {item.kind === "package" ? "Your sessions appear in the app as soon as you check out." : item.kind === "gift_card" ? "You'll get a gift code to share right after checkout." : item.pickup_note || "Ready at the front desk on your next visit."}
          </div>
        </div>

        {method === "klarna" && payOnline && <p className="mt-3 text-[14px]" style={{ color: "var(--ms-sub)" }}>Split it into payments with Klarna. You'll see your plan and agree to Klarna&apos;s terms on the next screen.</p>}
        {err && <p className="mt-3 text-[15px] text-rose-600" role="alert">{err}</p>}

        <button type="button" onClick={place} disabled={busy}
          className="mt-8 h-14 w-full rounded-2xl text-[17px] font-semibold text-white transition active:scale-[.99]"
          style={{ background: busy ? "color-mix(in srgb, var(--ms-p) 35%, #fff)" : "var(--ms-p)" }}>
          {busy ? "One moment…" : payOnline ? "Place order" : "Reserve, pay at the desk"}
        </button>
        <p className="mt-3 text-center text-[13px]" style={{ color: "var(--ms-icon)" }}>
          {payOnline ? `You'll pay on a secure Stripe page. ${business.name} receives the payment.` : "Nothing is charged now. The front desk will see your order."}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── Orders ───────────────────────── */

function OrderCard({ o, tName }: { o: ShopOrderRow; tName: Map<string, string> }) {
  const status = o.status === "pending" ? "Processing" : o.status === "reserved" ? "Pay at the desk" : o.status === "paid" ? (o.kind === "product" ? "Ready at the desk" : "Paid") : o.status === "fulfilled" ? (o.kind === "product" ? "Picked up" : "Done") : o.status;
  return (
    <div className="rounded-[18px] bg-white p-4 ring-1 ring-[var(--ms-line)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold" style={{ color: "var(--ms-ink)" }}>{o.item_name}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</div>
          <div className="text-[14px]" style={{ color: "var(--ms-sub)" }}>{new Date(o.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {cents(o.amount_cents)}</div>
        </div>
        <span className="shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium" style={o.status === "reserved" ? { background: "#fdf3e1", color: "#8a5a12" } : { background: "color-mix(in srgb, var(--ms-p) 10%, #fff)", color: "var(--ms-p)" }}>{status}</span>
      </div>
      {o.kind === "package" && o.sessions_total ? (
        <div className="mt-3.5">
          <div className="flex justify-between text-[14px]" style={{ color: "var(--ms-sub)" }}><span>{o.treatment_id ? tName.get(o.treatment_id) ?? "Sessions" : "Sessions"}</span><span>{o.sessions_total - o.sessions_used} of {o.sessions_total} left</span></div>
          <div className="mt-2 flex gap-1">{Array.from({ length: o.sessions_total }, (_, k) => <span key={k} className="h-2 flex-1 rounded-full" style={{ background: k < o.sessions_used ? "var(--ms-chip)" : "var(--ms-p)" }} />)}</div>
        </div>
      ) : null}
      {o.kind === "gift_card" && o.gift_code && (
        <div className="mt-3.5 rounded-xl border border-dashed p-3 text-center" style={{ borderColor: "color-mix(in srgb, var(--ms-p) 45%, #fff)" }}>
          <div className="text-[13px]" style={{ color: "var(--ms-sub)" }}>Gift code{o.recipient_name ? ` for ${o.recipient_name}` : ""}</div>
          <div className="mt-1 font-mono text-[22px] font-semibold tracking-[0.15em]" style={{ color: "var(--ms-ink)" }}>{o.gift_code}</div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--ms-sub)" }}>Balance {cents(o.gift_balance_cents ?? 0)}{o.status === "reserved" ? ", active once paid at the desk" : ""}</div>
        </div>
      )}
    </div>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-[20px] bg-white px-6 py-9 text-center ring-1 ring-[var(--ms-line)]">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--ms-p) 10%, #fff)", color: "var(--ms-p)" }}>{icon}</span>
      <div className="mt-3 text-[19px] font-semibold" style={{ color: "var(--ms-ink)" }}>{title}</div>
      <p className="mx-auto mt-1 max-w-[30ch] text-[15px] leading-relaxed" style={{ color: "var(--ms-sub)" }}>{body}</p>
    </div>
  );
}
