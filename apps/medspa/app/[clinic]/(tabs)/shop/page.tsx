import Link from "next/link";
import { optimizedUrl } from "@atlas/core/img";
import { activeTreatments, getClinic, type Clinic } from "@/lib/clinic";
import { SHOP_KIND_LABEL } from "@/lib/medspa";
import { priceLabel, type MedspaPlan } from "@/lib/plans";
import { TopBar } from "@/components/chrome";
import { TreatmentList } from "@/components/treatment-list";

const TABS = [
  { id: "browse", label: "Browse" },
  { id: "memberships", label: "Memberships" },
  { id: "treatments", label: "Treatments" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function Shop({ params, searchParams }: { params: { clinic: string }; searchParams: { tab?: string; cat?: string; focus?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const tab: TabId = (TABS.find((t) => t.id === searchParams.tab)?.id ?? (clinic.plans.length ? "memberships" : "browse"));
  const base = `/${clinic.slug}`;

  return (
    <>
      <TopBar slug={clinic.slug} title="Shop" />
      <nav className="sticky z-20 grid grid-cols-3 border-b border-line bg-white/95 backdrop-blur" style={{ top: "calc(60px + env(safe-area-inset-top, 0px))" }}>
        {TABS.map((t) => (
          <Link key={t.id} href={`${base}/shop?tab=${t.id}`} replace scroll={false}
            className={`relative py-3 text-center text-[14px] ${tab === t.id ? "font-semibold text-ink" : "text-sub"}`}>
            {t.label}
            {tab === t.id && <span className="absolute inset-x-5 bottom-0 h-[2px] rounded-full bg-ink" />}
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
    <div className="grid grid-cols-2 gap-3 px-4 pt-4">
      {plans.map((p, i) => (
        <Link key={p.id} href={`/${clinicSlug}/shop/membership/${p.id}`} className="animate-rise overflow-hidden rounded-card bg-white shadow-card" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="relative aspect-square bg-ink">
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedUrl(p.image_url, 360)} alt="" className="photo-bw h-full w-full object-cover opacity-90" loading="lazy" />
            )}
            <div className="absolute inset-0 grid place-items-center bg-black/25 p-3 text-center">
              <span className="text-[13px] font-bold uppercase tracking-[0.22em] text-white drop-shadow">{p.name}</span>
            </div>
          </div>
          <div className="p-3">
            <p className="line-clamp-2 min-h-[2.5em] text-[14px] font-medium leading-tight">{p.name}{p.tagline ? ` · ${p.tagline}` : ""}</p>
            <p className="mt-1.5 text-[13px] text-sub"><span className="font-semibold text-ink">{priceLabel(p.price_cents)}</span>/month</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Browse({ clinic, base }: { clinic: Clinic; base: string }) {
  const cats = Array.from(new Set(activeTreatments(clinic).map((t) => t.category)));
  const coverFor = (cat: string) => activeTreatments(clinic).find((t) => t.category === cat && t.image_url)?.image_url ?? null;
  const items = clinic.cfg.shop.enabled ? clinic.cfg.shop.items.filter((s) => s.is_active) : [];
  const kinds = (["package", "product", "gift_card"] as const).filter((k) => items.some((i) => i.kind === k));

  return (
    <div className="pt-4">
      <div className="grid grid-cols-2 gap-3 px-4">
        {clinic.plans.length > 0 && (
          <Tile href={`${base}/shop?tab=memberships`} label="Memberships" img={clinic.plans[0].image_url} />
        )}
        {cats.map((c) => <Tile key={c} href={`${base}/shop?tab=treatments&cat=${encodeURIComponent(c)}`} label={c} img={coverFor(c)} />)}
      </div>

      {kinds.map((k) => (
        <section key={k} className="mt-7">
          <h3 className="px-5 text-[21px] font-semibold tracking-[-0.015em]">{SHOP_KIND_LABEL[k]}</h3>
          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-5 pb-2">
            {items.filter((i) => i.kind === k).map((i) => (
              <Link key={i.id} href={`${base}/shop/item/${i.id}`} className="w-[170px] shrink-0">
                <div className="aspect-square overflow-hidden rounded-[16px] bg-white shadow-card">
                  {i.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedUrl(i.image_url, 340)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-[14px] font-medium leading-snug">{i.name}</p>
                <p className="mt-0.5 text-[13px] text-sub">
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

function Tile({ href, label, img }: { href: string; label: string; img: string | null }) {
  return (
    <Link href={href} className="relative aspect-[4/3] overflow-hidden rounded-card bg-ink shadow-card">
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedUrl(img, 360)} alt="" className="photo-bw absolute inset-0 h-full w-full object-cover opacity-80" loading="lazy" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <span className="absolute bottom-3 left-3.5 text-[16px] font-semibold text-white">{label}</span>
    </Link>
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
