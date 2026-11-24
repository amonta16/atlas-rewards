/**
 * components/landing/as-seen-at.tsx — CP-277 · "As seen at" the Cal Poly AI Hackathon.
 *
 *   AsSeenAtSection   /med-spas: the big one. Words + event numbers, the classroom photo with a glass
 *                     label and a link to the organizers' recap; the judge's video once it's approved.
 *   AsSeenAtStamp     /medspa/app: a small stamp above "Why we built Atlas". Light on purpose.
 *   JudgeReactions    /medspa/app, at the end: "What the judges said". A marked placeholder until the
 *                     interview is in and approved (JUDGE_REACTIONS in lib/landing/medspa-funnel.ts).
 *
 * Claims: event facts only (from the recap). No prize, ranking or "finalist" wording, and no quotes until
 * the judge has approved them. Server-safe; YouTubeLite is the only client piece.
 */
import { ArrowUpRight } from "lucide-react";
import { AS_SEEN_AT, JUDGE_REACTIONS } from "@/lib/landing/medspa-funnel";
import { YouTubeLite } from "@/components/landing/youtube-lite";
import { cn } from "@/lib/utils";

const approved = () => JUDGE_REACTIONS.videos.filter((v) => v.approved && v.youtube && v.quote.trim());

function Logo({ className = "", light = false }: { className?: string; light?: boolean }) {
  const { logo } = AS_SEEN_AT;
  return (
    // The organizer's logo in one colour (it's teal + white on their dark site).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/landing/${logo.file}`} alt={logo.alt} width={logo.w} height={logo.h} loading="lazy" decoding="async"
      className={cn("w-auto brightness-0", light ? "invert" : "opacity-80", className)} />
  );
}

function RecapLink({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <a href={AS_SEEN_AT.recapUrl} target="_blank" rel="noopener" className={cn("s-focus", className)}>
      {children}
    </a>
  );
}

/** The judge's approved video + their words. Renders nothing until one is approved. */
function JudgeQuote({ v }: { v: (typeof JUDGE_REACTIONS.videos)[number] }) {
  const who = [v.title, v.company].filter(Boolean).join(", ");
  return (
    <figure className="grid items-center gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
      <YouTubeLite id={v.youtube} title={`${v.name}, ${v.role}`} className="!rounded-3xl" />
      <div>
        <blockquote className="text-[clamp(1.35rem,1.1rem+1vw,1.9rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--s-ink)]">&ldquo;{v.quote}&rdquo;</blockquote>
        <figcaption className="mt-5">
          <span className="block text-[16px] font-bold text-[var(--s-ink)]">{v.name}</span>
          <span className="block text-[14px] text-[var(--s-ink-3)]">{who ? `${who} · ` : ""}{v.role}</span>
        </figcaption>
      </div>
    </figure>
  );
}

/* ───────────── /med-spas: the big section ───────────── */
export function AsSeenAtSection() {
  const { event, short, where, dates, photo, facts } = AS_SEEN_AT;
  const videos = approved();
  return (
    <section id="as-seen-at" className="s-section relative scroll-mt-16 overflow-hidden bg-[var(--s-paper)]" aria-labelledby="seen-title">
      {/* soft ocean glow behind the words, like the hero */}
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(59,163,255,.18),transparent)]" />
      <div className="s-wrap relative">
        <div className="grid items-end gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--s-ocean)]">As seen at</span>
              <span aria-hidden className="h-5 w-px bg-[var(--s-ink)]/15" />
              <Logo className="h-8 sm:h-10" />
            </p>
            <h2 id="seen-title" className="s-h2 mt-6 max-w-[15ch]">Demoed live at Cal Poly&apos;s AI Hackathon.</h2>
            <p className="s-lead mt-6 max-w-[34rem]">
              In November our team spent a weekend at the {event}, building a new AI skin-analysis prototype for med spas and
              showing it working, live, to the judges and mentors. What we learned that weekend goes back into the Atlas app.
            </p>
          </div>
          <div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4 lg:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="border-l-2 border-[var(--s-ocean)] pl-4">
                  <dt className="sr-only">{f.label}</dt>
                  <dd>
                    <span className="block text-[clamp(2.2rem,1.6rem+2vw,3.2rem)] font-bold leading-none tracking-[-0.04em] text-[var(--s-ink)]">{f.value}</span>
                    <span className="mt-1.5 block text-[14px] text-[var(--s-ink-3)]">{f.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="s-small mt-6">Event numbers from the organizers&apos; recap.</p>
          </div>
        </div>

        <figure className="relative mt-12 overflow-hidden rounded-[28px] shadow-[0_50px_100px_-50px_rgba(6,49,143,.55)] ring-1 ring-black/5 sm:mt-16 sm:rounded-[36px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/landing/${photo.file}`} alt={photo.alt} width={photo.w} height={photo.h} loading="lazy" decoding="async"
            className="block aspect-[3/2] w-full object-cover sm:aspect-[2/1]" />
          <div aria-hidden className="absolute inset-x-0 top-0 hidden aspect-[2/1] bg-gradient-to-t from-[#06183A]/45 via-transparent to-transparent sm:block" />
          <figcaption className="flex flex-col gap-3 bg-white p-4 sm:absolute sm:inset-x-6 sm:bottom-6 sm:flex-row sm:items-end sm:justify-between sm:bg-transparent sm:p-0">
            <span className="w-fit sm:rounded-2xl sm:bg-white/80 sm:px-4 sm:py-3 sm:shadow-[0_20px_40px_-24px_rgba(6,24,58,.7)] sm:ring-1 sm:ring-white/70 sm:backdrop-blur-xl">
              <span className="block text-[14px] font-bold text-[var(--s-ink)] sm:text-[15px]">{short}</span>
              <span className="block text-[12.5px] text-[var(--s-ink-2)] sm:text-[13px]">{where} · {dates}</span>
            </span>
            <RecapLink className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--s-ice)] px-5 py-3 text-[15px] font-bold text-[var(--s-ocean-deep)] transition-colors hover:bg-[#d6e9ff] sm:bg-white sm:shadow-[0_20px_40px_-20px_rgba(6,24,58,.8)] sm:hover:bg-[var(--s-ice)]">
              See the event recap <ArrowUpRight className="h-4 w-4" aria-hidden />
            </RecapLink>
          </figcaption>
        </figure>

        {videos.length > 0 && (
          <div className="mt-14 rounded-[32px] bg-white p-5 ring-1 ring-[var(--s-line)] sm:p-8">
            <p className="mb-6 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--s-ocean)]">What the judges said</p>
            <div className="grid gap-10">{videos.map((v) => <JudgeQuote key={v.youtube} v={v} />)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────── /medspa/app: the small stamp ───────────── */
export function AsSeenAtStamp() {
  return (
    <div className="bg-white pb-2 pt-2 sm:pt-4">
      <RecapLink className="group mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border border-[#0B1B2B]/10 bg-white/80 px-5 py-3 shadow-[0_18px_40px_-30px_rgba(11,95,214,.6)] backdrop-blur transition-colors hover:border-[#0B5FD6]/30">
        <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#0B5FD6]">As seen at</span>
        <Logo className="h-5" />
        <span className="text-[13.5px] font-medium text-[#3A4A5C]">{AS_SEEN_AT.short} · {AS_SEEN_AT.month}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-[#6B7A8C] transition-colors group-hover:text-[#0B5FD6]" aria-hidden />
      </RecapLink>
    </div>
  );
}

/* ───────────── /medspa/app: "What the judges said", at the end ───────────── */
export function JudgeReactions() {
  const videos = approved();
  if (videos.length === 0 && !JUDGE_REACTIONS.showSlots) return null;
  return (
    <section aria-labelledby="judges-h" className="relative overflow-hidden border-t border-[#0B1B2B]/8 bg-[#F6F9FD] py-16 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute -right-48 -top-48 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(59,163,255,.16),transparent)]" />
      <div className="s-wrap relative">
        <div className="mx-auto max-w-[44rem] text-center">
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#0B5FD6]">{AS_SEEN_AT.short}</span>
            <Logo className="h-5" />
          </p>
          <h2 id="judges-h" className="mt-5 text-[clamp(2rem,1.3rem+2.6vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em] text-[#0B1B2B]">What the judges said.</h2>
          <p className="mx-auto mt-4 max-w-[34rem] text-[17px] leading-relaxed text-[#3A4A5C]">
            We demoed our AI live for the judges and mentors at the {AS_SEEN_AT.event}. {videos.length ? "Here it is in their own words." : "Their reaction, on camera and in their own words, is coming soon."}
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-[1080px] rounded-[32px] bg-white p-4 shadow-[0_40px_90px_-50px_rgba(2,20,70,.45)] ring-1 ring-black/5 sm:p-7">
          {videos.length > 0 ? (
            <div className="grid gap-10">{videos.map((v) => <JudgeQuote key={v.youtube} v={v} />)}</div>
          ) : (
            // PLACEHOLDER (CP-277): replaced by the judge's video + approved quote from JUDGE_REACTIONS.videos.
            <div data-placeholder="judge-interview" className="grid items-center gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
              <div className="relative grid aspect-video place-items-center overflow-hidden rounded-3xl border border-dashed border-[#0B5FD6]/30 bg-gradient-to-br from-[#E6F1FF] via-[#F6F9FD] to-white">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-[#0B5FD6]/70 shadow-[0_10px_24px_-12px_rgba(11,95,214,.6)]">
                  <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" aria-hidden><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
                </span>
                <span className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[12px] font-semibold text-[#3A4A5C] ring-1 ring-[#0B1B2B]/8 backdrop-blur">Judge interview · coming soon</span>
              </div>
              <div className="rounded-3xl border border-dashed border-[#0B5FD6]/25 p-6">
                <p className="text-[19px] font-semibold leading-snug text-[#3A4A5C]">Quote slot: this fills with the judge&apos;s own words once they&apos;ve approved them.</p>
                <p className="mt-4 text-[14px] text-[#6B7A8C]">Name and role shown only with their OK.</p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center">
          <RecapLink className="inline-flex items-center gap-1.5 rounded-full text-[15px] font-semibold text-[#0B5FD6] hover:underline">
            See the event recap <ArrowUpRight className="h-4 w-4" aria-hidden />
          </RecapLink>
        </p>
      </div>
    </section>
  );
}
