/**
 * ProvidersStrip — CP-185 · "Your team" on the med spa Home.
 * Horizontal scroll of providers from medspa_config. Hides itself when empty.
 */
import { SectionHeading } from "@/components/customer/section-elements";
import type { Business } from "@/lib/types/database";
import type { MedspaProvider } from "@/lib/medspa";

export function ProvidersStrip({ business, providers }: { business: Business; providers: MedspaProvider[] }) {
  const list = providers.filter((p) => p.is_active && p.name.trim());
  if (list.length === 0) return null;
  const { primary, secondary } = business.brand_colors;
  return (
    <section className="mt-7">
      <div className="px-4 flex items-baseline justify-between"><SectionHeading business={business}>Your team</SectionHeading><span className="text-xs text-zinc-500">{list.length} provider{list.length === 1 ? "" : "s"}</span></div>
      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((p) => (
          <div key={p.id} className="w-[150px] shrink-0 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <div className="aspect-square overflow-hidden rounded-2xl" style={{ background: `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)` }}>
              {p.photo_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
                : <div className="grid h-full w-full place-items-center text-2xl font-extrabold text-white/90">{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>}
            </div>
            <div className="mt-2.5 truncate text-sm font-bold text-zinc-900">{p.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{p.title || "Provider"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
