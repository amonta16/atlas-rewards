/**
 * components/preview-close.tsx — CP-246 · the close on /p/<slug>, after the app has done the wow.
 *
 * From the funnel review (Sabri Suby's lead-gen page checklist): the page had a great demo and a
 * three-bullet pitch. These add, in his order, problem → mechanism → proof → offer → P.S.:
 *   Mechanism   why booking reminders and Allē don't bring patients back, and Due-Date Recall
 *   ProofRow    a real count of med spas that built their app this week (hidden under 3) and the
 *               first review screenshots, right above the offer
 *   CallOffer   the Launch Plan call sold as its own offer: value, three takeaways (whether or not
 *               they buy), the 90-day guarantee, one Book button
 *   PostScript  the TL;DR at the very bottom, selling against doing nothing
 * Server components; copy lives in lib/offer.ts (LAUNCH_CALL, MECHANISM, OFFER.guarantees).
 */
import { LAUNCH_CALL, MECHANISM, OFFER } from "@/lib/offer";

const Tick = ({ color }: { color: string }) => (
  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: color }} aria-hidden>
    <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

export function Mechanism({ primary }: { primary: string }) {
  return (
    <section aria-labelledby="pv-mech" className="mt-10 max-w-[34rem]">
      <h2 id="pv-mech" className="text-[24px] font-semibold leading-[1.15] tracking-[-0.015em]">Why patients don&apos;t come back on time</h2>
      <ul className="mt-4 space-y-2.5">
        {MECHANISM.problem.map((p) => (
          <li key={p.t} className="flex gap-3 text-[15.5px] leading-snug text-ink">
            <span className="mt-[3px] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#F3E3E1] text-[13px] font-bold text-[#A23B2C]" aria-hidden>×</span>
            <span><b>{p.t}</b> {p.d}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-[24px] bg-white p-5 shadow-soft">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: primary }}>How your app fixes it</p>
        <h3 className="mt-1 text-[21px] font-semibold tracking-[-0.01em]">{MECHANISM.name}</h3>
        <ol className="mt-3 space-y-3">
          {MECHANISM.steps.map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: primary }}>{i + 1}</span>
              <span className="text-[15px] leading-snug"><b className="block">{s.t}</b><span className="text-sub">{s.d}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type ReviewImage = { id: string; url: string; width: number | null; height: number | null; alt: string };

export function ProofRow({ builtThisWeek, reviews }: { builtThisWeek: number | null; reviews: ReviewImage[] }) {
  const shown = reviews.slice(0, 3);
  const count = builtThisWeek !== null && builtThisWeek >= 3 ? builtThisWeek : null;
  if (!count && !shown.length) return null;
  return (
    <section aria-label="Proof" className="mt-8 max-w-[34rem]">
      {count && (
        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          <span className="relative flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
          {count} med spas built their app this week
        </p>
      )}
      {shown.length > 0 && (
        <a href="#pv-reviews" className="mt-3 flex items-center gap-2.5" aria-label="See the real reviews">
          {shown.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.id} src={img.url} alt="" loading="lazy" decoding="async" className="h-[88px] w-auto max-w-[30%] rounded-[12px] bg-white object-cover object-top shadow-soft ring-1 ring-line" />
          ))}
          <span className="text-[13.5px] font-semibold text-sub underline-offset-2 hover:underline">Real reviews ↓</span>
        </a>
      )}
    </section>
  );
}

export function CallOffer({ walkthroughUrl, primary, businessName }: { walkthroughUrl: string; primary: string; businessName: string }) {
  return (
    <section aria-labelledby="pv-call" className="mt-8 max-w-[34rem] overflow-hidden rounded-[24px] bg-white shadow-soft ring-1 ring-line">
      <div className="p-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: primary }}>Free · {LAUNCH_CALL.minutes} min · with Andrew</p>
        <h2 id="pv-call" className="mt-1 text-[22px] font-semibold leading-[1.15] tracking-[-0.015em]">{businessName}&apos;s {LAUNCH_CALL.name}</h2>
        <p className="mt-1.5 text-[14.5px] text-sub">
          Worth <span className="line-through">${LAUNCH_CALL.value}</span> on its own, free with your preview. You leave with all three, whether or not you sign up:
        </p>
        <ul className="mt-3.5 space-y-2.5">
          {LAUNCH_CALL.takeaways.map((t) => (
            <li key={t.t} className="flex gap-3 text-[15px] leading-snug"><Tick color={primary} /><span><b>{t.t}.</b> <span className="text-sub">{t.d}</span></span></li>
          ))}
        </ul>
        <a href={walkthroughUrl} className="mt-5 flex h-[54px] w-full items-center justify-center rounded-full text-[16px] font-semibold text-white active:scale-[.99]" style={{ background: primary }}>
          Book my free {LAUNCH_CALL.minutes}-min call
        </a>
      </div>
      <div className="flex gap-3 border-t border-line bg-[#FAFAF9] px-5 py-4">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: primary }} aria-hidden><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8.8 12.2l2.2 2.2 4.2-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <p className="text-[14px] leading-snug"><b>If you go live, it {OFFER.guarantees[0].replace(/^./, (c) => c.toLowerCase())}.</b> <span className="text-sub">Month to month, cancel any month.</span></p>
      </div>
    </section>
  );
}

export function PostScript({ businessName, walkthroughUrl, primary, expires }: { businessName: string; walkthroughUrl: string; primary: string; expires: string }) {
  return (
    <section aria-label="P.S." className="mx-auto mt-12 max-w-[640px] rounded-[24px] bg-white p-6 shadow-soft">
      <p className="text-[16px] leading-relaxed text-ink">
        <b>P.S.</b> The short version: {businessName}&apos;s app is already built. A free {LAUNCH_CALL.minutes}-minute call gets you your overdue-patient
        number, your first three automations and a written launch plan, whether or not you go live.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-ink">
        If you do nothing, nothing changes. The patients who are due this month stay due, and the ones who rebook will book wherever reminds them first.
        Your preview is saved until {expires}.
      </p>
      <a href={walkthroughUrl} className="mt-5 inline-flex h-[52px] items-center justify-center rounded-full px-6 text-[16px] font-semibold text-white" style={{ background: primary }}>
        Book my free call
      </a>
    </section>
  );
}
