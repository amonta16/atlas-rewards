import { notFound } from "next/navigation";
import Link from "next/link";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic, treatmentById } from "@/lib/clinic";
import { bookingOptions } from "@/lib/medspa";
import { fromPrice, priceLabel } from "@/lib/plans";
import { SubBar } from "@/components/chrome";
import { ActionButton } from "@/components/action-sheet";
import { TrackView } from "@/components/recently-viewed";
import { IcCheck, IcClock, IcNext, IcSpark } from "@/components/icons";

export default async function TreatmentDetail({ params }: { params: { clinic: string; id: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const t = treatmentById(clinic, params.id);
  if (!t) notFound();
  const base = `/${clinic.slug}`;
  const plans = clinic.plans.filter((p) => p.included.some((i) => i.treatment_id === t.id));
  const results = clinic.cfg.gallery.filter((g) => g.consent && g.treatment_id === t.id && g.before_url && g.after_url).slice(0, 4);

  return (
    <article>
      <TrackView slug={clinic.slug} itemKey={`t:${t.id}`} />
      <SubBar slug={clinic.slug} title="Shop" fallback={`${base}/shop?tab=treatments`} />
      <div className="relative aspect-[4/3] overflow-hidden bg-tint">
        {t.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(t.image_url, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      <section className="px-5 pb-2 pt-5">
        <span className="pill-soft">Treatment</span>
        <h1 className="mt-2.5 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">{t.name}</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-sub">{t.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium">
          <span>{t.category}</span>
          <span className="inline-flex items-center gap-1"><IcClock className="h-3.5 w-3.5" />{t.duration_minutes} min</span>
        </div>
        <p className="mt-4 flex items-center gap-2.5 text-[15px]">
          <span className="font-semibold">{fromPrice(t)}</span>
          {t.member_price_cents ? <><span className="h-4 w-px bg-line" /><span className="font-semibold text-brand">{priceLabel(t.member_price_cents)} for Members</span></> : null}
        </p>
      </section>

      {plans.length > 0 && (
        <section className="mx-4 mt-5 rounded-[14px] bg-[#F4F5F6] p-4">
          <p className="eyebrow">Included in</p>
          {plans.map((p) => (
            <Link key={p.id} href={`${base}/shop/membership/${p.id}`} className="mt-2 flex items-center justify-between text-[15px] font-semibold">
              {p.name} · {priceLabel(p.price_cents)}/mo <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
            </Link>
          ))}
        </section>
      )}

      {results.length > 0 && (
        <section className="mt-7 px-4">
          <h2 className="px-1 text-[19px] font-semibold tracking-[-0.015em]">Results</h2>
          <div className="mt-3 space-y-4">
            {results.map((g) => (
              <figure key={g.id}>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] bg-line">
                  {[["Before", g.before_url], ["After", g.after_url]].map(([label, url]) => (
                    <div key={label} className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={optimizedUrl(url, 360)} alt={`${label}: ${g.caption}`} className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold uppercase text-white">{label}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="px-1 pt-2 text-[13.5px] text-sub">{g.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {t.aftercare.length > 0 && (
        <section className="mt-7 px-4">
          <h2 className="px-1 text-[19px] font-semibold tracking-[-0.015em]">What to expect?</h2>
          <div className="mt-3 rounded-[12px] border border-line p-4">
            <p className="flex items-center gap-2 text-[14.5px] font-semibold"><IcSpark className="h-[18px] w-[18px]" />After your treatment</p>
            <ul className="mt-2.5 space-y-2">
              {t.aftercare.map((a) => <li key={a} className="flex gap-2 text-[13.5px] leading-snug text-sub"><IcCheck className="mt-[1px] h-4 w-4 shrink-0 text-ink" />{a}</li>)}
            </ul>
          </div>
        </section>
      )}

      <section className="sticky z-20 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.2rem + env(safe-area-inset-bottom, 0px))" }}>
        <ActionButton label="Book now" options={bookingOptions(clinic.cfg.booking, clinic.name, clinic.phone, t)}
          sheet={{ title: `Book ${t.name}`, body: `${t.duration_minutes} minutes · ${fromPrice(t)}` }} />
      </section>
    </article>
  );
}
