import { MapPin, Heart, Coffee } from "lucide-react";
import { Reveal } from "./reveal";

/**
 * "Built on the Central Coast" — CP-101.
 * Real photos of the team (public/landing/team-*.jpg). Captions are
 * placeholders until names/roles are confirmed.
 */
export function TeamSection() {
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="team-title">
      <div className="lp-container grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <p className="lp-eyebrow">
            <MapPin className="h-3.5 w-3.5 text-[#e07a3f]" aria-hidden /> Built on the Central Coast
          </p>
          <h2 id="team-title" className="lp-h2 mt-4">Made by people who actually walk into your shop.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Atlas started as a group of college students who kept hearing the same thing from the cafés, gyms and
            salons around us: the chains have apps, and we&apos;re stuck with punch cards. So we built the app — and we
            set it up with you in person, not through a support ticket.
          </p>
          <ul className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Coffee, t: "Local first", d: "We work with businesses we can drive to." },
              { icon: Heart, t: "Hands-on setup", d: "We build your app with you, at your counter." },
              { icon: MapPin, t: "Here after launch", d: "Same people on the call, every time." },
            ].map(({ icon: I, t, d }) => (
              <li key={t} className="rounded-xl border border-[#e8dfd1] bg-white p-4">
                <I className="h-4 w-4 text-[#1f5f8b]" aria-hidden />
                <div className="mt-2 text-sm font-semibold text-[#14213d]">{t}</div>
                <div className="mt-1 text-xs text-slate-500">{d}</div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120} className="relative">
          <div className="pointer-events-none absolute -left-8 -top-8 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(240,163,94,0.35),transparent)] blur-2xl" aria-hidden />
          <div className="grid grid-cols-[1.3fr_1fr] gap-3 sm:gap-4">
            <figure className="relative overflow-hidden rounded-2xl shadow-[0_24px_60px_-30px_rgba(20,33,61,0.45)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/team-sunset.jpg" alt="The Atlas Engine team on a field at sunset" width={1600} height={1067} loading="lazy" className="h-full w-full object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#14213d]/80 to-transparent px-4 pb-3 pt-10 text-xs text-white">
                The Atlas team · San Luis Obispo <span className="lp-placeholder ml-1 rounded px-1 font-mono text-[9px] text-white/80">[ CONFIRM CAPTION ]</span>
              </figcaption>
            </figure>
            <div className="grid gap-3 sm:gap-4">
              <figure className="relative overflow-hidden rounded-2xl shadow-[0_24px_60px_-30px_rgba(20,33,61,0.45)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/team-field.jpg" alt="The Atlas Engine team at a local ballfield" width={1600} height={1067} loading="lazy" className="aspect-[4/5] h-full w-full object-cover object-[60%_center]" />
              </figure>
              <div className="rounded-2xl border border-[#e8dfd1] bg-white p-4">
                <div className="text-3xl font-semibold tracking-tight text-[#14213d]">4</div>
                <div className="text-xs text-slate-500">founders, one town, a lot of coffee</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
