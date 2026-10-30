import { notFound } from "next/navigation";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic, treatmentById } from "@/lib/clinic";
import { bookingOptions } from "@/lib/medspa";
import { priceLabel } from "@/lib/plans";
import { FloatingBack } from "@/components/chrome";
import { IncludedCard } from "@/components/included-card";
import { ActionButton } from "@/components/action-sheet";
import { IcCheck, IcGift } from "@/components/icons";

const WHY = [
  "Spread the cost monthly with no deposit",
  "Treatments when you need them, nothing to pay on the day",
  "Member-only pricing across the whole menu",
];

export default async function MembershipDetail({ params }: { params: { clinic: string; id: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const plan = clinic.plans.find((p) => p.id === params.id);
  if (!plan) notFound();
  const base = `/${clinic.slug}`;
  const options = bookingOptions(
    { ...clinic.cfg.booking, message: `Hi {practice}! I'd like to join the ${plan.name} membership.` },
    clinic.name, clinic.phone, null,
  );

  return (
    <article>
      <div className="relative aspect-[4/3] overflow-hidden bg-ink">
        <FloatingBack fallback={`${base}/shop?tab=memberships`} />
        {plan.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(plan.image_url, 900)} alt="" className="photo-bw absolute inset-0 h-full w-full object-cover opacity-85" />
        )}
        <div className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="text-[22px] font-bold uppercase tracking-[0.26em] text-white drop-shadow">{plan.name}</span>
        </div>
      </div>

      <section className="bg-white px-5 pb-7 pt-6">
        <p className="eyebrow">Membership</p>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-[1.08] tracking-[-0.02em]">{plan.name}</h1>
        {plan.description && <p className="mt-3 text-[15px] leading-relaxed text-sub">{plan.description}</p>}
        <p className="mt-5 text-[13px] font-bold uppercase tracking-[0.08em] text-sub">Why join?</p>
        <ul className="mt-2 space-y-1.5 text-[14.5px] text-sub">
          {WHY.map((w) => <li key={w} className="flex gap-2"><span className="text-faint">·</span>{w}</li>)}
        </ul>
        {plan.commitment_months > 0 && <p className="mt-4 text-[14px] text-sub">Commitment period: minimum {plan.commitment_months} months</p>}
        <p className="mt-4 text-[28px] font-semibold tracking-[-0.02em]">{priceLabel(plan.price_cents)}<span className="text-[15px] font-normal text-sub">/mo</span></p>
      </section>

      {plan.benefits.length > 0 && (
        <section className="bg-tint px-5 py-8">
          <h2 className="text-center text-[22px] font-semibold tracking-[-0.015em]">Membership benefits</h2>
          <ul className="mx-auto mt-5 max-w-[340px] space-y-3">
            {plan.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[15px] leading-snug">
                <IcCheck className="mt-[1px] h-5 w-5 shrink-0 text-ink" />{b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.included.length > 0 && (
        <section className="px-4 py-8">
          <h2 className="text-center text-[22px] font-semibold tracking-[-0.015em]">Included treatments</h2>
          <p className="mt-1.5 text-center text-[14px] text-sub">Receive the following with your membership</p>
          <div className="mt-5 space-y-3">
            {plan.included.map((it, i) => {
              const t = it.treatment_id ? treatmentById(clinic, it.treatment_id) : null;
              return <IncludedCard key={i} item={it} href={t ? `${base}/shop/treatment/${t.id}` : null} image={t?.image_url ?? null} about={t?.description ?? null} />;
            })}
          </div>
        </section>
      )}

      <section className="sticky z-20 space-y-2.5 bg-gradient-to-t from-page via-page to-page/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.6rem + env(safe-area-inset-bottom, 0px))" }}>
        <ActionButton label="Subscribe now!" options={options}
          sheet={{ title: `Join ${plan.name}`, body: `${priceLabel(plan.price_cents)}/month. ${clinic.name} will set up your membership and your first visit.` }} />
        {plan.join_bonus && (
          <div className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card">
            <IcGift className="h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-snug text-sub">{plan.join_bonus}</p>
          </div>
        )}
      </section>
    </article>
  );
}
