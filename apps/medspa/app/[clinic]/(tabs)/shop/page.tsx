import Link from "next/link";
import { optimizedUrl } from "@atlas/core/img";
import { activeTreatments, getClinic, type Clinic } from "@/lib/clinic";
import { SHOP_KIND_LABEL, type FinancingMethod, FINANCING_LIMITS } from "@/lib/medspa";
import { fromPrice, priceLabel, type MedspaPlan } from "@/lib/plans";
import { TopBar } from "@/components/chrome";
import { TreatmentList } from "@/components/treatment-list";
import { PayLaterBanner } from "@/components/pay-later-banner";
import { IcCategory } from "@/components/icons";

const TABS = [
  { id: "browse", label: "Browse" },
  { id: "memberships", label: "Memberships" },
  { id: "treatments", label: "Treatments" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function Shop({ params, searchParams }: { params: { clinic: string }; searchParams: { tab?: string; cat?: string; focus?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const tab: TabId = TABS.find((t) => t.id === searchParams.tab)?.id ?? "browse";
  const base = `/${clinic.slug}`;

  return (
    <>
      <TopBar slug={clinic.slug} title="Shop" />
      <nav className="sticky z-20 grid grid-cols-3 border-b border-line bg-white" style={{ top: "calc(54px + env(safe-area-inset-top, 0px))" }}>
        {TABS.map((t) => (
          <Link key={t.id} href={`${base}/shop?tab=${t.id}`} replace scroll={false}
            className={`relative py-2.5 text-center text-[13px] ${tab === t.id ? "font-semibold text-ink" : "text-sub"}`}>
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-ink" />}
          </Link>
        ))}
      </nav>

      {tab === "memberships" && <Memberships clinicSlug={clinic.slug} plans={clinic.plans} />}
      {tab === "treatments" && (
        <TreatmentList slug={clinic.slug} treatments={activeTreatments(clinic)} initialCategory={searchParams.cat ?? null} autoFocus={searchParams.focus === "1"} />
      )}
      {tab === "browse" && <Browse clinic={clinic} base={base} />}
    </>
  );
}

function Memberships({ clinicSlug, plans }: { clinicSlug: string; plans: MedspaPlan[] }) {
  if (!plans.length) return <Empty title="Memberships are coming soon" body="Ask the front desk about member pricing." />;
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-5 px-4 pt-4">
      {plans.map((p, i) => (
        <Link key={p.id} href={`/${clinicSlug}/shop/membership/${p.id}`} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="relative aspect-square overflow-hidden rounded-[10px] bg-ink">
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedUrl(p.image_url, 360)} alt="" className="photo-bw h-full w-full object-cover opacity-90" loading="lazy" />
            )}
            <div className="absolute inset-0 grid place-items-center bg-black/30 p-3 text-center">
              <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-white drop-shadow">{p.name}</span>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-[13.5px] font-medium leading-tight">{p.name}{p.tagline ? ` · ${p.tagline}` : ""}</p>
          <p className="mt-1 text-[13px] text-sub"><span className="font-semibold text-ink">{priceLabel(p.price_cents)}</span>/month</p>
        </Link>
      ))}
    </div>
  );
}

function Browse({ clinic, base }: { clinic: Clinic; base: string }) {
  const treatments = activeTreatments(clinic);
  const cats = Array.from(new Set(treatments.map((t) => t.category)));
  const items = clinic.cfg.shop.enabled ? clinic.cfg.shop.items.filter((s) => s.is_active) : [];
  const kinds = (["package", "product", "gift_card"] as const).filter((k) => items.some((i) => i.kind === k));
  const payLater = clinic.cfg.shop.enabled ? (["klarna", "affirm"] as FinancingMethod[]).filter((m) => clinic.cfg.shop.financing[m]).map((m) => FINANCING_LIMITS[m].label) : [];

  return (
    <div className="pt-3">
      {payLater.length > 0 && <PayLaterBanner lenders={payLater} clinic={clinic.name} />}

      {cats.length > 0 && (
        <div className="grid grid-cols-3 gap-y-4 px-4 pt-5">
          {cats.map((c) => (
            <Link key={c} href={`${base}/shop?tab=treatments&cat=${encodeURIComponent(c)}`} className="flex flex-col items-center gap-1.5 px-1 text-center">
              <IcCategory name={c} className="h-9 w-9 text-ink" />
              <span className="w-full truncate text-[12.5px] font-medium">{c}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-x-2.5 gap-y-5 px-4">
        {treatments.map((t) => (
          <Link key={t.id} href={`${base}/shop/treatment/${t.id}`} className="min-w-0">
            <div className="aspect-square overflow-hidden rounded-[10px] bg-page">
              {t.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedUrl(t.image_url, 360)} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </div>
            <p className="mt-2 truncate text-[13.5px] font-medium">{t.name}</p>
            <p className="mt-0.5 text-[13.5px] font-semibold">{fromPrice(t)}</p>
          </Link>
        ))}
      </div>

      {kinds.map((k) => (
        <section key={k} className="mt-8">
          <h3 className="px-5 text-[19px] font-semibold tracking-[-0.015em]">{SHOP_KIND_LABEL[k]}</h3>
          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4 pb-2">
            {items.filter((i) => i.kind === k).map((i) => (
              <Link key={i.id} href={`${base}/shop/item/${i.id}`} className="w-[calc(50%-5px)] shrink-0">
                <div className="aspect-square overflow-hidden rounded-[10px] bg-page">
                  {i.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedUrl(i.image_url, 340)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <p className="mt-2 truncate text-[13.5px] font-medium">{i.name}</p>
                <p className="mt-0.5 text-[13.5px] font-semibold">
                  {i.kind === "gift_card" ? `From ${priceLabel(Math.min(...(i.amounts.length ? i.amounts : [0])))}` : priceLabel(i.price_cents)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-8 pt-20 text-center">
      <p className="text-[19px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[14.5px] text-sub">{body}</p>
    </div>
  );
}
