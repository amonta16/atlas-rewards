import { notFound } from "next/navigation";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic } from "@/lib/clinic";
import { bookingOptions, SHOP_KIND_LABEL } from "@/lib/medspa";
import { priceLabel } from "@/lib/plans";
import { SubBar } from "@/components/chrome";
import { ActionButton } from "@/components/action-sheet";
import { BuyPanel } from "@/components/buy-panel";
import { TrackView } from "@/components/recently-viewed";
import { getPatient } from "@/lib/patient";
import { shopTakesCards } from "@/lib/payments";

export default async function ShopItem({ params }: { params: { clinic: string; id: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const item = clinic.cfg.shop.items.find((i) => i.id === params.id && i.is_active);
  if (!item) notFound();
  const price = item.kind === "gift_card"
    ? item.amounts.map((a) => priceLabel(a)).join(" · ")
    : priceLabel(item.price_cents);
  const [patient, takesCards] = await Promise.all([getPatient(clinic), shopTakesCards(clinic)]);
  const forSale = item.kind === "gift_card" ? item.amounts.length > 0 : (item.price_cents ?? 0) > 0;
  const options = bookingOptions({ ...clinic.cfg.booking, message: `Hi {practice}! I'd like to buy ${item.name}.` }, clinic.name, clinic.phone, null);

  return (
    <article>
      <TrackView slug={clinic.slug} itemKey={`i:${item.id}`} />
      <SubBar slug={clinic.slug} title="Shop" fallback={`/${clinic.slug}/shop?tab=browse`} />
      <div className="relative aspect-[4/3] overflow-hidden bg-page">
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(item.image_url, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <section className="px-5 pb-6 pt-5">
        <span className="pill-soft">{SHOP_KIND_LABEL[item.kind]}</span>
        <h1 className="mt-2.5 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">{item.name}</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-sub">{item.description}</p>
        <p className="mt-4 flex items-center gap-2.5 text-[15px]">
          <span className="font-semibold">{price || "Price at the clinic"}</span>
          {item.member_price_cents ? <><span className="h-4 w-px bg-line" /><span className="font-semibold text-brand">{priceLabel(item.member_price_cents)} for Members</span></> : null}
        </p>
        {item.sessions && <p className="mt-1 text-[13.5px] text-sub">{item.sessions} sessions</p>}
      </section>
      {forSale ? (
        <BuyPanel slug={clinic.slug} isMember={patient.isMember} takesCards={takesCards} financing={clinic.cfg.shop.financing}
          itemName={item.name} image={item.image_url} pickupNote={item.pickup_note}
          points={patient.points} earnRate={clinic.pointsPerDollar} rewards={clinic.rewards}
          item={{ id: item.id, kind: item.kind, amounts: item.amounts, price_cents: item.price_cents, member_price_cents: item.member_price_cents }} />
      ) : (
        <section className="sticky z-20 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.2rem + env(safe-area-inset-bottom, 0px))" }}>
          <ActionButton label="Ask about this" options={options}
            sheet={{ title: item.name, body: `${clinic.name} will tell you the price and have it ready for you.` }} />
        </section>
      )}
    </article>
  );
}
