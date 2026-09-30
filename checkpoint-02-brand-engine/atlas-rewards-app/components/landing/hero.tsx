import { Bell, CalendarCheck, FileSignature } from "lucide-react";
import { optimizedUrl } from "@/lib/img";
import { APP_MOCKUPS } from "@/lib/landing/apps";
import { ANCHORS } from "@/lib/landing/config";
import { LIB } from "@/lib/landing/live-app-data";
import { DemoCta, PreviewCta } from "./cta-button";

/**
 * Hero — CP-176.
 * Type-led headline on white, then a photo stage: real venue photos
 * (arcade, party, bowling, VR) behind Flippo's actual app. Entertainment
 * only — the smoke shop / med spa mockups left the hero with the FEC focus.
 */
const TILES = [
  { src: LIB.arcadeNeon, cls: "left-[-4%] top-[8%] h-[70%] w-[34%] -rotate-3 sm:w-[30%]", drift: "lp-drift", alt: "Neon arcade machines" },
  { src: LIB.party, cls: "right-[-3%] top-[4%] h-[46%] w-[34%] rotate-2 sm:w-[30%]", drift: "lp-drift-2", alt: "Kids at a birthday party" },
  { src: LIB.bowling, cls: "right-[2%] bottom-[-6%] h-[44%] w-[26%] -rotate-2", drift: "lp-drift", alt: "Bowling lanes" },
  { src: LIB.vr, cls: "left-[6%] bottom-[-10%] h-[36%] w-[22%] rotate-3 hidden md:block", drift: "lp-drift-2", alt: "A guest playing VR" },
];

export function Hero() {
  const app = APP_MOCKUPS.find((a) => a.id === "flippos") ?? APP_MOCKUPS[0];
  return (
    <section className="lp-hero-glow relative overflow-hidden pt-28 md:pt-36" aria-labelledby="hero-title" id={ANCHORS.product}>
      <div className="lp-container">
        <div className="mx-auto max-w-4xl text-center">
          <h1 id="hero-title" className="lp-h1">
            The app your guests keep.
            <br />
            <span className="lp-gradient-text">Built for fun centers.</span>
          </h1>
          <p className="lp-lead mx-auto mt-6 max-w-xl">
            Parties, memberships, waivers and rewards in one app with your name on it — set up with you in one visit.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DemoCta source="hero" event="hero_cta_clicked" size="xl" className="w-full sm:w-auto" />
            <PreviewCta source="hero" size="xl" className="w-full sm:w-auto">Try the app</PreviewCta>
          </div>
          <p className="mt-5 text-sm text-slate-500">No new computer · Works with any POS · Live in one visit</p>
        </div>

        {/* Photo stage */}
        <div className="relative mx-auto mt-12 max-w-5xl md:mt-16">
          <div className="relative h-[480px] overflow-hidden rounded-[2rem] bg-[#0b1a2e] sm:h-[560px] sm:rounded-[2.5rem]">
            {TILES.map((t) => (
              <div key={t.src} className={`absolute ${t.cls}`}>
                <div className={`h-full w-full overflow-hidden rounded-[1.5rem] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 ${t.drift}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizedUrl(t.src, 520)} alt={t.alt} className="h-full w-full object-cover" loading="eager" />
                </div>
              </div>
            ))}
            <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_45%,rgba(11,26,46,0.15),rgba(11,26,46,0.75))]" aria-hidden />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0284c7]/45 blur-3xl" aria-hidden />

            <div className="absolute inset-x-0 top-8 mx-auto h-[520px] w-[250px] sm:top-12 sm:h-[600px] sm:w-[290px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={app.upright}
                alt={app.alt}
                width={660}
                height={1300}
                loading="eager"
                className="w-full object-contain object-top drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
              />
            </div>

            <Chip className="left-4 top-8 hidden sm:flex lg:left-[26%] lg:top-14" icon={<Bell className="h-4 w-4 text-[#1f5f8b]" />}>
              <b>Slow Tuesday</b> <span className="text-slate-500">happy-hour push sent</span>
            </Chip>
            <Chip className="right-4 top-[40%] hidden sm:flex lg:right-[24%]" icon={<CalendarCheck className="h-4 w-4 text-emerald-600" />}>
              <b>Party rebooked</b> <span className="text-slate-500">11 months later</span>
            </Chip>
            <Chip className="bottom-10 left-6 hidden sm:flex lg:left-[27%]" icon={<FileSignature className="h-4 w-4 text-[#1f5f8b]" />}>
              <b>Waiver signed</b> <span className="text-slate-500">on their phone</span>
            </Chip>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">{app.name} — a real app running on Atlas.</p>
        </div>
      </div>
    </section>
  );
}

function Chip({ children, className, icon }: { children: React.ReactNode; className?: string; icon: React.ReactNode }) {
  return (
    <div className={`lp-light lp-float-slow absolute z-10 items-center gap-2 rounded-xl bg-white px-3 py-2 text-[13px] text-[#14213d] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.45)] ${className ?? ""}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3f7fb]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
