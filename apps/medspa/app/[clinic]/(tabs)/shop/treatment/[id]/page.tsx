import { notFound } from "next/navigation";
import Link from "next/link";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic, treatmentById } from "@/lib/clinic";
import { bookingOptions } from "@/lib/medspa";
import { fromPrice, priceLabel } from "@/lib/plans";
import { FloatingBack } from "@/components/chrome";
import { ActionButton } from "@/components/action-sheet";
import { IcCheck, IcClock, IcNext } from "@/components/icons";

export default async function TreatmentDetail({ params }: { params: { clinic: string; id: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const t = treatmentById(clinic, params.id);
  if (!t) notFound();
  const base = `/${clinic.slug}`;
  const plans = clinic.plans.filter((p) => p.included.some((i) => i.treatment_id === t.id));
  const results = clinic.cfg.gallery.filter((g) => g.consent && g.treatment_id === t.id && g.before_url && g.after_url).slice(0, 4);

  return (
    <article>
      <div className="relative aspect-[4/3] overflow-hidden bg-tint">
        <FloatingBack fallback={`${base}/shop?tab=treatments`} />
        {t.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(t.image_url, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      <section className="bg-white px-5 pb-7 pt-6">
        <span className="rounded-[6px] bg-page px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-sub">Treatment</span>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.08] tracking-[-0.02em]">{t.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-page px-2.5 py-1 text-[12.5px] font-medium">{t.category}</span>
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[12.5px] font-medium"><IcClock className="h-3.5 w-3.5" />{t.duration_minutes} min</span>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-sub">{t.description}</p>
        <div className="mt-5 flex items-baseline gap-3">
          <p className="text-[22px] font-semibold tracking-[-0.015em]">{fromPrice(t)}</p>
          {t.member_price_cents && <p className="text-[14px] font-semibold text-brand">Members {priceLabel(t.member_price_cents)}</p>}
        </div>
      </section>

      {plans.length > 0 && (
        <section className="mx-4 mt-4 rounded-card bg-white p-4 shadow-card">
          <p className="eyebrow">Included in</p>
          {plans.map((p) => (
            <Link key={p.id} href={`${base}/shop/membership/${p.id}`} className="mt-2 flex items-center justify-between text-[15.5px] font-semibold">
              {p.name} · {priceLabel(p.price_cents)}/mo <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
            </Link>
          ))}
        </section>
      )}

      {results.length > 0 && (
        <section className="mt-7 px-4">
          <h2 className="px-1 text-[21px] font-semibold tracking-[-0.015em]">Results</h2>
          <div className="mt-3 space-y-3">
            {results.map((g) => (
              <figure key={g.id} className="overflow-hidden rounded-card bg-white shadow-card">
                <div className="grid grid-cols-2 gap-px bg-line">
                  {[["Before", g.before_url], ["After", g.after_url]].map(([label, url]) => (
                    <div key={label} className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={optimizedUrl(url, 360)} alt={`${label}: ${g.caption}`} className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold uppercase text-white">{label}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="px-4 py-3 text-[14px] text-sub">{g.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {t.aftercare.length > 0 && (
        <section className="mx-4 mt-7 rounded-card bg-white p-5 shadow-card">
          <h2 className="text-[19px] font-semibold">Aftercare</h2>
          <ul className="mt-3 space-y-2.5">
            {t.aftercare.map((a) => <li key={a} className="flex gap-2.5 text-[14.5px] leading-snug text-sub"><IcCheck className="mt-[1px] h-[18px] w-[18px] shrink-0 text-ink" />{a}</li>)}
          </ul>
        </section>
      )}

      <section className="sticky z-20 bg-gradient-to-t from-page via-page to-page/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.6rem + env(safe-area-inset-bottom, 0px))" }}>
        <ActionButton label="Book now" options={bookingOptions(clinic.cfg.booking, clinic.name, clinic.phone, t)}
          sheet={{ title: `Book ${t.name}`, body: `${t.duration_minutes} minutes · ${fromPrice(t)}` }} />
      </section>
    </article>
  );
}
