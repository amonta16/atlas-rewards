import { notFound } from "next/navigation";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic, treatmentById } from "@/lib/clinic";
import { bookingOptions } from "@/lib/medspa";
import { priceLabel } from "@/lib/plans";
import { SubBar } from "@/components/chrome";
import { IncludedCard } from "@/components/included-card";
import { SubscribeButton } from "@/components/subscribe-button";
import { getPatient } from "@/lib/patient";
import { clinicTakesCards } from "@/lib/payments";
import { ActionButton } from "@/components/action-sheet";
import { IcCalendar, IcCheck, IcGift, IcStar, IcTag } from "@/components/icons";

const TILE_ICONS = [IcTag, IcCalendar, IcGift, IcStar];

export default async function MembershipDetail({ params }: { params: { clinic: string; id: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const plan = clinic.plans.find((p) => p.id === params.id);
  if (!plan) notFound();
  const base = `/${clinic.slug}`;
  const [patient, takesCards] = await Promise.all([getPatient(clinic), clinicTakesCards(clinic)]);
  const onThisPlan = patient.isMember && (!patient.planName || patient.planName === plan.name);
  const options = bookingOptions(
    { ...clinic.cfg.booking, message: `Hi {practice}! I'd like to join the ${plan.name} membership.` },
    clinic.name, clinic.phone, null,
  );
  // The first two benefits read as a checklist, the rest as black tiles.
  const checks = plan.benefits.slice(0, plan.benefits.length > 2 ? 2 : plan.benefits.length);
  const tiles = plan.benefits.slice(checks.length);

  return (
    <article>
      <SubBar slug={clinic.slug} title="Memberships" fallback={`${base}/shop?tab=memberships`} />
      <div className="relative aspect-[16/10] overflow-hidden bg-ink">
        {plan.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(plan.image_url, 900)} alt="" className="photo-bw absolute inset-0 h-full w-full object-cover opacity-85" />
        )}
        <div className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="text-[20px] font-bold uppercase tracking-[0.26em] text-white drop-shadow">{plan.name}</span>
        </div>
      </div>

      <section className="px-5 pb-6 pt-5">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.08em]">{clinic.name} · {plan.name}</p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em]">{plan.tagline || plan.name}</h1>
        {plan.description && <p className="mt-3 text-[14.5px] leading-relaxed text-sub">{plan.description}</p>}
        {plan.commitment_months > 0 && <p className="mt-3 text-[13.5px] text-sub">Commitment period: minimum {plan.commitment_months} months</p>}
        <p className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">{priceLabel(plan.price_cents)}<span className="text-[13px] font-normal text-sub">/mo</span></p>
      </section>

      {plan.benefits.length > 0 && (
        <section className="px-4 pb-7">
          <h2 className="text-center text-[20px] font-semibold tracking-[-0.015em]">Membership Benefits</h2>
          <ul className="mt-4 space-y-2 px-1">
            {checks.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[14px] font-medium leading-snug"><IcCheck className="mt-[1px] h-[18px] w-[18px] shrink-0" />{b}</li>
            ))}
          </ul>
          {tiles.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {tiles.map((b, i) => {
                const Icon = TILE_ICONS[i % TILE_ICONS.length];
                return (
                  <div key={b} className={`rounded-[10px] bg-[#0E0F13] p-3.5 text-white ${tiles.length % 2 === 1 && i === tiles.length - 1 ? "col-span-2" : ""}`}>
                    <Icon className="h-5 w-5" />
                    <p className="mt-2.5 text-[13.5px] font-medium leading-snug">{b}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {plan.included.length > 0 && (
        <section className="px-4 pb-7">
          <h2 className="text-center text-[20px] font-semibold tracking-[-0.015em]">Included treatments</h2>
          <p className="mt-1 text-center text-[13.5px] font-medium">Receive the following with your membership</p>
          <div className="mt-3 divide-y divide-line">
            {plan.included.map((it, i) => {
              const t = it.treatment_id ? treatmentById(clinic, it.treatment_id) : null;
              return <IncludedCard key={i} item={it} href={t ? `${base}/shop/treatment/${t.id}` : null} image={t?.image_url ?? null} about={t?.description ?? null} />;
            })}
          </div>
        </section>
      )}

      <section className="sticky z-20 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-6" style={{ bottom: "calc(4.2rem + env(safe-area-inset-bottom, 0px))" }}>
        {patient.isMember ? (
          <a href={`${base}/profile`} className="btn-ghost">{onThisPlan ? "You're a member" : `You're on ${patient.planName}`}</a>
        ) : takesCards ? (
          <SubscribeButton slug={clinic.slug} planId={plan.id} label="Subscribe now!" options={options}
            fallbackSheet={{ title: `Join ${plan.name}`, body: `${priceLabel(plan.price_cents)}/month. ${clinic.name} will set up your membership and your first visit.` }} />
        ) : (
          <ActionButton label="Subscribe now!" options={options}
            sheet={{ title: `Join ${plan.name}`, body: `${priceLabel(plan.price_cents)}/month. ${clinic.name} will set up your membership and your first visit.` }} />
        )}
      </section>
      <div className="px-5 pb-6 pt-1">
        {!patient.isMember && takesCards && <p className="text-center text-[12.5px] text-faint">{priceLabel(plan.price_cents)} billed monthly · Secure checkout by Stripe</p>}
        {plan.join_bonus && (
          <div className="mt-3 flex items-center gap-3">
            <IcGift className="h-6 w-6 shrink-0" />
            <p className="text-[13px] leading-snug text-sub">{plan.join_bonus}</p>
          </div>
        )}
      </div>
    </article>
  );
}
