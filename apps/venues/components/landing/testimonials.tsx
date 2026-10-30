"use client";
import { useRef, useState } from "react";
import { Play, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHOW_TESTIMONIAL_PLACEHOLDERS, TESTIMONIALS, type Testimonial } from "@/lib/landing/testimonials";
import { track } from "@/lib/landing/analytics";
import { Reveal } from "./reveal";

/**
 * Video testimonials — CP-176. Vertical phone-shot clips from Flippo's.
 * Config + how-to: lib/landing/testimonials.ts. While a card has no video
 * it renders as a clearly-marked placeholder (only when
 * SHOW_TESTIMONIAL_PLACEHOLDERS is on).
 */
export function Testimonials() {
  const items = TESTIMONIALS.filter((t) => t.video || t.embed || SHOW_TESTIMONIAL_PLACEHOLDERS);
  if (items.length === 0) return null;
  return (
    <section className="lp-section" aria-labelledby="testimonials-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">In their words</p>
          <h2 id="testimonials-title" className="lp-h2 mt-4">Hear it from Flippo&apos;s.</h2>
          <p className="lp-lead mt-4">The owner, the front desk, and the guests who use it every week.</p>
        </Reveal>
        <ul className="-mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-auto sm:grid sm:max-w-5xl sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {items.map((t, i) => (
            <Reveal as="li" key={t.id} delay={i * 80} className="w-[78%] shrink-0 snap-center sm:w-auto">
              <VideoCard t={t} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function VideoCard({ t }: { t: Testimonial }) {
  const [playing, setPlaying] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  const has = !!(t.video || t.embed);

  const play = () => {
    if (!has) return;
    setPlaying(true);
    track("vsl_played", { source: "testimonial", id: t.id });
    setTimeout(() => vid.current?.play().catch(() => {}), 30);
  };

  return (
    <figure className="lp-card overflow-hidden">
      <div className="relative aspect-[9/14] overflow-hidden bg-[#0b1a2e]">
        {playing && t.embed ? (
          <iframe src={`${t.embed}${t.embed.includes("?") ? "&" : "?"}autoplay=1`} title={`${t.name} — ${t.role}`} allow="autoplay; fullscreen; picture-in-picture" className="absolute inset-0 h-full w-full" />
        ) : playing && t.video ? (
          <video ref={vid} src={t.video} poster={t.poster} controls playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={play} disabled={!has} className="lp-focus group absolute inset-0 block h-full w-full text-left" aria-label={has ? `Play video: ${t.name}, ${t.role}` : `Video coming soon: ${t.name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.poster} alt="" loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-700", has && "group-hover:scale-105", !has && "opacity-60 saturate-50")} />
            <span className="absolute inset-0 bg-gradient-to-t from-[#0b1a2e]/85 via-[#0b1a2e]/10 to-transparent" />
            <span className={cn("absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-2xl transition-transform", has ? "bg-white text-[#14213d] group-hover:scale-110" : "border border-dashed border-white/70 bg-white/10 text-white backdrop-blur")}>
              <Play className="ml-1 h-6 w-6 fill-current" aria-hidden />
            </span>
            {!has && (
              <span className="absolute left-3 top-3 rounded-full border border-dashed border-white/70 bg-black/35 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white backdrop-blur">
                Video testimonial goes here
              </span>
            )}
          </button>
        )}
      </div>
      <figcaption className="p-5">
        {t.quote ? (
          <p className="flex gap-2 text-[15px] leading-relaxed text-[#14213d]">
            <Quote className="mt-1 h-4 w-4 shrink-0 text-[#1f5f8b]" aria-hidden /> {t.quote}
          </p>
        ) : (
          SHOW_TESTIMONIAL_PLACEHOLDERS && <p className="lp-placeholder rounded-md px-2.5 py-1.5 font-mono text-[11px] text-slate-500">[ One real line from the video ]</p>
        )}
        <p className="mt-3 text-sm font-semibold text-[#14213d]">{t.name}</p>
        <p className="text-[13px] text-slate-500">{t.role}</p>
      </figcaption>
    </figure>
  );
}
