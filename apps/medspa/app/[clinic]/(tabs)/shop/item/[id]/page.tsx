import { notFound } from "next/navigation";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic } from "@/lib/clinic";
import { bookingOptions, SHOP_KIND_LABEL } from "@/lib/medspa";
import { priceLabel } from "@/lib/plans";
import { FloatingBack } from "@/components/chrome";
import { ActionButton } from "@/components/action-sheet";
import { BuyPanel } from "@/components/buy-panel";
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
      <div className="relative aspect-square overflow-hidden bg-white">
        <FloatingBack fallback={`/${clinic.slug}/shop?tab=browse`} />
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(item.image_url, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <section className="bg-white px-5 pb-8 pt-6">
        <p className="eyebrow">{SHOP_KIND_LABEL[item.kind]}</p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">{item.name}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-sub">{item.description}</p>
        <div className="mt-5 flex items-baseline gap-3">
          <p className="text-[22px] font-semibold">{price || "Price at the clinic"}</p>
          {item.member_price_cents && <p className="text-[14px] font-semibold text-brand">Members {priceLabel(item.member_price_cents)}</p>}
        </div>
        {item.sessions && <p className="mt-1 text-[14px] text-sub">{item.sessions} sessions</p>}
        {item.pickup_note && <p className="mt-4 rounded-[14px] bg-page px-4 py-3 text-[14px] text-sub">{item.pickup_note}</p>}
      </section>
      {forSale ? (
        <BuyPanel slug={clinic.slug} isMember={patient.isMember} takesCards={takesCards} financing={clinic.cfg.shop.financing}
          item={{ id: item.id, kind: item.kind, amounts: item.amounts, price_cents: item.price_cents, member_price_cents: item.member_price_cents }} />
      ) : (
        <section className="sticky z-20 bg-gradient-to-t from-page via-page to-page/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.6rem + env(safe-area-inset-bottom, 0px))" }}>
          <ActionButton label="Ask about this" options={options}
            sheet={{ title: item.name, body: `${clinic.name} will tell you the price and have it ready for you.` }} />
        </section>
      )}
    </article>
  );
}
