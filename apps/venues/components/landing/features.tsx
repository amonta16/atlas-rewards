import { BadgeCheck, CalendarCheck, FileSignature, Gift, type LucideIcon } from "lucide-react";
import { optimizedUrl } from "@/lib/img";
import { LIB } from "@/lib/landing/live-app-data";
import { Reveal } from "./reveal";

/**
 * Features — CP-176. Photo-led cards (were icon tiles). Each photo carries a
 * small "what the app just did" notification so the card shows the feature
 * happening, not just an icon for it.
 */
const FEATURES: Array<{ icon: LucideIcon; t: string; d: string; img: string; alt: string; note: string; noteSub: string }> = [
  {
    icon: CalendarCheck,
    t: "Birthday parties that rebook",
    d: "Every party family gets the app at the desk. Eleven months later, the reminder to book again sends itself.",
    img: LIB.party,
    alt: "Kids celebrating a birthday party",
    note: "Party rebooked",
    noteSub: "Reminder sent 11 months later",
  },
  {
    icon: BadgeCheck,
    t: "Memberships",
    d: "Sell and renew memberships in the app. Lapsing members get a nudge before they're gone.",
    img: LIB.bowling,
    alt: "Neon-lit bowling lanes",
    note: "Pass renewed",
    noteSub: "Nudged before it lapsed",
  },
  {
    icon: FileSignature,
    t: "Digital waivers",
    d: "Guests sign on their own phone while they wait — and every signed waiver becomes a member you can reach.",
    img: LIB.friends,
    alt: "Friends playing arcade games together",
    note: "Waiver signed",
    noteSub: "On their phone, in line",
  },
  {
    icon: Gift,
    t: "Rewards, events & slow nights",
    d: "Points on every visit, and one push to fill a dead Tuesday with a happy-hour deal.",
    img: LIB.arcadeRow2,
    alt: "A row of arcade machines",
    note: "Happy Hour Tuesday",
    noteSub: "Pushed to every member",
  },
];

export function Features() {
  return (
    <section className="lp-section" aria-labelledby="features-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">What it does</p>
          <h2 id="features-title" className="lp-h2 mt-4">Built around how a venue actually makes money.</h2>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: I, t, d, img, alt, note, noteSub }, i) => (
            <Reveal as="li" key={t} delay={i * 70} className="lp-card group overflow-hidden">
              <div className="relative aspect-[16/9] overflow-hidden bg-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={optimizedUrl(img, 720)} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1a2e]/55 via-transparent to-transparent" />
                <div className="lp-light absolute bottom-4 left-4 flex items-center gap-2.5 rounded-2xl bg-white/90 py-2 pl-2 pr-3.5 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#0284c7] text-white"><I className="h-4 w-4" aria-hidden /></span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-semibold text-[#14213d]">{note}</span>
                    <span className="block text-[11.5px] text-slate-500">{noteSub}</span>
                  </span>
                </div>
              </div>
              <div className="p-6 sm:p-7">
                <h3 className="text-lg font-semibold text-[#14213d]">{t}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{d}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={300} className="mt-6 text-center text-sm text-slate-500">
          Also included: Google review requests, referrals, a prize wheel, a front-desk scanner app and a results dashboard.
        </Reveal>
      </div>
    </section>
  );
}
