/**
 * ShopStrip — CP-190 · featured Shop items on the med spa Home.
 * Hides itself when the shop is off or nothing is featured.
 */
import { Gift, Package, Sparkles } from "lucide-react";
import { AppLink } from "@/components/customer/app-link";
import { SectionHeading } from "@/components/customer/section-elements";
import { optimizedUrl } from "@/lib/img";
import type { Business } from "@/lib/types/database";
import { cents, type MedspaShop } from "@/lib/medspa";

export function ShopStrip({ business, slug, shop, isMember }: { business: Business; slug: string; shop: MedspaShop; isMember: boolean }) {
  if (!shop.enabled) return null;
  const list = shop.items.filter((i) => i.is_active && i.featured).slice(0, 6);
  if (list.length === 0) return null;
  const { primary, secondary } = business.brand_colors;
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between px-4"><SectionHeading business={business}>Shop</SectionHeading><AppLink slug={slug} to="/store" className="text-xs font-bold" style={{ color: primary }}>See all</AppLink></div>
      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((it) => {
          const price = it.kind === "gift_card" ? it.amounts[0] ?? null : (isMember && it.member_price_cents ? it.member_price_cents : it.price_cents);
          return (
            <AppLink key={it.id} slug={slug} to={`/store?tab=${it.kind === "package" ? "packages" : it.kind === "product" ? "products" : "gifts"}`} className="w-[160px] shrink-0 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="relative aspect-square" style={{ background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
                {it.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={optimizedUrl(it.image_url, 400)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  : <div className="absolute inset-0 grid place-items-center text-white/85">{it.kind === "gift_card" ? <Gift className="h-8 w-8" /> : it.kind === "package" ? <Package className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}</div>}
              </div>
              <div className="p-3">
                <div className="line-clamp-2 text-[13px] font-bold leading-tight text-zinc-900">{it.name}</div>
                <div className="mt-1 text-[13px] font-extrabold" style={{ color: primary }}>{price ? (it.kind === "gift_card" ? `From ${cents(price)}` : cents(price)) : "Ask at the desk"}</div>
              </div>
            </AppLink>
          );
        })}
      </div>
    </section>
  );
}
