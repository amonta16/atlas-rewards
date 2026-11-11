/**
 * Venue website — server-rendered page body. See app/[business]/site/page.tsx.
 *
 * Sections follow the business's old site (home, about, cages, arcade,
 * parties, menu, contact) with two changes the owner asked for: booking is the
 * app's photo-first flow, and there's a section to get the app.
 */
import { ArrowRight, CalendarCheck, Clock, Gift, MapPin, MessageCircle, Navigation, Phone, ShieldCheck, Sparkles, Star, Ticket, Trophy, Utensils, Users } from "lucide-react";
import type { VenueSiteContent } from "@/lib/venue-site/content";
import { optimizedUrl } from "@/lib/img";
import { durationLabel } from "@/lib/booking";
import { BookButton, BookingSection, LiveSectionNote, SpeedGauge, type SiteMember, type SiteResource } from "./site-booking";
import type { SiteLiveRow } from "@/lib/venue-site/live";
import { LoopVideo, MenuBoard, MobileBookBar, OpenNow, RevealOnScroll, SiteNav } from "./site-chrome";
import { hoursLine } from "@/lib/venue-site/hours";

export type SiteReward = { id: string; name: string; point_cost: number; image_url: string };

const fmtPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
};

export type SiteWaiver = { href: string; signInHref: string | null; validDays: number | null };

export function VenueSite({ c, name, logoUrl, phone, address, resources, member, rewards, visitPoints, storeLinks, slug, waiver, live }: {
  c: VenueSiteContent; name: string; logoUrl: string | null; phone: string; address: string; slug: string;
  /** The business's own Atlas waiver (signup → waiver gate, or /app/waiver when signed in). */
  waiver: SiteWaiver | null;
  /** What's in use right now (same as the app's Book tab). */
  live: SiteLiveRow[];
  resources: SiteResource[]; member: SiteMember; rewards: SiteReward[]; visitPoints: number;
  storeLinks: { ios: string; android: string; joinCode: string };
}) {
  const links = [
    { href: "#book", label: "Book" },
    { href: "#cages", label: "Batting Cages" },
    { href: "#arcade", label: "Arcade" },
    { href: "#parties", label: "Parties" },
    { href: "#food", label: "Food" },
    { href: "#app", label: "The app" },
    { href: "#visit", label: "Visit" },
  ];
  // Quick-book rows in the hero: one per section of bookable things.
  const sections: Array<{ category: string; count: number; cover: string | null; durations: number[]; ids: string[] }> = [];
  for (const r of resources) {
    const s = sections.find(x => x.category === r.category);
    if (s) { s.count++; s.ids.push(r.id); if (!s.cover && r.image_url) s.cover = r.image_url; }
    else sections.push({ category: r.category, count: 1, cover: r.image_url, durations: r.durations, ids: [r.id] });
  }
  const cageCat = sections.find(s => /cage/i.test(s.category))?.category;
  const partyCat = sections.find(s => /part/i.test(s.category))?.category;
  const poolCat = sections.find(s => /pool/i.test(s.category))?.category;
  const mapsQ = encodeURIComponent(address);
  // "Pick your speed": every cage with a known pitch speed, slowest to fastest.
  const speedCages = resources.filter(r => r.mph).sort((a, b) => a.mph! - b.mph!);
  const speedColor = (mph: number) => (mph >= 50 ? "#e8344a" : mph >= 40 ? "#f97316" : mph >= 32 ? "#ca8a04" : "#16a34a");
  const waiverExt = waiver?.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {};
  const foodButtons = (
    <>
      <a href={`tel:${c.food.orderPhone}`} className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[var(--vs-ink)] px-4 text-[15px] font-extrabold text-white hover:brightness-125 lg:rounded-full lg:px-6 lg:text-[16px]">
        <Phone className="h-4 w-4" /> <span className="lg:hidden">Call to order</span><span className="hidden lg:inline">Call in a pickup order</span>
      </a>
      <a href={c.food.menuImage} target="_blank" rel="noopener" className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[15px] font-extrabold ring-1 ring-[var(--vs-line)] hover:ring-[var(--vs-ink)]/30 lg:rounded-full lg:px-6 lg:text-[16px]">
        <Utensils className="h-4 w-4" /> <span className="lg:hidden">Full menu</span><span className="hidden lg:inline">Printable menu</span>
      </a>
    </>
  );

  return (
    <div className="vs-root">
      <RevealOnScroll />
      <MobileBookBar phone={phone} />

      {/* hours bar */}
      <div className="bg-[var(--vs-ink)] text-white">
        <div className="mx-auto flex h-9 max-w-[1200px] items-center justify-between gap-4 px-4 text-[12.5px] font-semibold sm:px-6">
          <OpenNow hours={c.hours} timezone={c.timezone} className="text-white/90" />
          <div className="hidden items-center gap-4 text-white/75 sm:flex">
            {c.hours.map(h => <span key={h.label}><b className="text-white">{h.label}</b> {hoursLine(h)}</span>)}
          </div>
          <a href="#visit" className="inline-flex items-center gap-1 text-white/85 hover:text-white sm:hidden"><MapPin className="h-3.5 w-3.5" /> {c.city}</a>
        </div>
      </div>

      <SiteNav logoUrl={logoUrl} name={name} phone={phone} links={links} />

      <main>
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section id="top" className="relative isolate overflow-hidden bg-[var(--vs-ink)] text-white">
          <div className="absolute inset-0 -z-10">
            <LoopVideo decorative src={c.hero.video} poster={c.hero.poster} label={`Inside ${c.shortName}`} className="h-full w-full object-cover opacity-70" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,22,40,.92)_0%,rgba(6,22,40,.72)_45%,rgba(6,22,40,.25)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[rgba(6,22,40,.8)] to-transparent" />
          </div>
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:min-h-[640px] lg:grid-cols-[1.1fr_.9fr] lg:py-24">
            <div>
              <span className="vs-reveal inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-[13px] font-bold ring-1 ring-white/20 backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-[var(--vs-sun)]" /> {c.hero.eyebrow}
              </span>
              <h1 className="vs-reveal font-display mt-5 text-[clamp(54px,10vw,116px)] font-extrabold leading-[0.9]" data-delay="1">
                {c.hero.title.split(" ").map((w, i) => (
                  <span key={i} className={i === 1 ? "text-[var(--vs-sky)]" : i === 2 ? "text-[var(--vs-sun)]" : ""}>{w}{" "}</span>
                ))}
              </h1>
              <p className="vs-reveal mt-5 max-w-[520px] text-[clamp(17px,2vw,20px)] leading-relaxed text-white/85" data-delay="2">{c.hero.sub}</p>
              <div className="vs-reveal mt-8 flex flex-wrap gap-3" data-delay="3">
                <BookButton category={cageCat} className="inline-flex h-14 items-center gap-2 rounded-full bg-[var(--vs-red)] px-7 text-[17px] font-extrabold text-white shadow-[0_14px_30px_-12px_var(--vs-red)] transition hover:brightness-105 active:scale-[0.98]">
                  Book a cage <ArrowRight className="h-5 w-5" />
                </BookButton>
                <BookButton category={partyCat} className="inline-flex h-14 items-center gap-2 rounded-full bg-white px-7 text-[17px] font-extrabold text-[var(--vs-ink)] transition hover:bg-[var(--vs-sky-soft)] active:scale-[0.98]">
                  Plan a party
                </BookButton>
              </div>
              <div className="vs-reveal mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] font-semibold text-white/80" data-delay="3">
                <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-white"><Phone className="h-4 w-4" /> {fmtPhone(phone)}</a>
                {waiver && <a href={waiver.href} {...waiverExt} className="inline-flex items-center gap-1.5 hover:text-white"><ShieldCheck className="h-4 w-4" /> Sign your waiver</a>}
                <a href="#visit" className="inline-flex items-center gap-1.5 hover:text-white"><MapPin className="h-4 w-4" /> {address.split(",")[0]}</a>
              </div>
            </div>

            {/* Quick book card */}
            {sections.length > 0 && (
              <div className="vs-reveal rounded-[30px] bg-white/95 p-4 text-[var(--vs-ink)] shadow-[0_30px_80px_-30px_rgba(0,0,0,.7)] backdrop-blur sm:p-5" data-delay="2">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <div className="font-display text-[22px] font-extrabold leading-tight">Book in seconds</div>
                    <div className="text-[13px] text-[var(--vs-ink)]/60">Live availability, no account needed</div>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--vs-sky-soft)] text-[var(--vs-blue)]"><CalendarCheck className="h-5 w-5" /></span>
                </div>
                <div className="mt-4 grid gap-2.5">
                  {sections.map(s => (
                    <BookButton key={s.category} category={s.category}
                      className="group flex w-full items-center gap-3 rounded-2xl bg-[var(--vs-paper)] p-2 pr-3 text-left ring-1 ring-[var(--vs-line)] transition hover:bg-white hover:ring-[var(--vs-blue)]/40 active:scale-[0.99]">
                      {s.cover
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={optimizedUrl(s.cover, 200)} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                        : <span className="h-16 w-20 shrink-0 rounded-xl bg-[var(--vs-sky-soft)]" />}
                      <span className="min-w-0 flex-1">
                        <span className="font-display flex items-center text-[18px] font-extrabold leading-tight">{s.category}<LiveSectionNote ids={s.ids} initial={live} /></span>
                        <span className="block text-[13px] text-[var(--vs-ink)]/60">{s.count} to choose from · {s.durations.map(durationLabel).join(" or ")}</span>
                      </span>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--vs-blue)] text-white transition group-hover:translate-x-0.5"><ArrowRight className="h-4 w-4" /></span>
                    </BookButton>
                  ))}
                </div>
                <p className="mt-3 px-1 text-center text-[12px] text-[var(--vs-ink)]/55">Same schedule as the {c.shortName} app, so what you see is really open.</p>
              </div>
            )}
          </div>
        </section>

        {/* marquee */}
        <div className="overflow-hidden bg-[var(--vs-sky)] py-3 text-[var(--vs-ink)]" aria-hidden="true">
          <div className="vs-marquee flex w-max gap-8 whitespace-nowrap font-display text-[20px] font-extrabold">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex gap-8">
                {([["Batting cages", "⚾"], ["Arcade", "🎮"], ["Pool tables", "🎱"], ["Up to 55 MPH", "⚾"], ["Video games", "🎮"], ["Prize Hub", "🎱"],
                  ["HitTrax", "⚾"], ["Air hockey", "🎮"], ["Birthday parties", "🎱"], ["Pizza & cold beer", "⚾"]] as const).map(([t, e]) => (
                  <span key={t} className="inline-flex items-center gap-8">{t}<span aria-hidden="true">{e}</span></span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── BOOK ─────────────────────────────────────────────────── */}
        <section id="book" className="bg-[var(--vs-paper)] py-12 md:py-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="vs-reveal max-w-[640px]">
                <span className="vs-tag">Reserve online</span>
                <h2 className="font-display mt-3 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1]">Pick it. Pick a time. Play.</h2>
                <p className="mt-3 text-[17px] leading-relaxed text-[var(--vs-ink)]/70">
                  Tap a cage, a pool table or the party room, then choose a day and a start time. No account, no back-and-forth. We text you to confirm.
                </p>
              </div>
              <ol className="vs-reveal grid grid-cols-3 gap-2 text-center text-[12px] font-bold md:w-[380px]" data-delay="1">
                {[["1", "Pick a spot"], ["2", "Pick a time"], ["3", "Get a text"]].map(([n, t]) => (
                  <li key={n} className="rounded-2xl bg-white px-2 py-3 ring-1 ring-[var(--vs-line)]">
                    <span className="font-display mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[var(--vs-sun)] text-[15px] font-extrabold">{n}</span>
                    <span className="mt-1.5 block">{t}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="vs-reveal mt-8" data-delay="1">
              <BookingSection slug={slug} businessName={name} resources={resources} phone={phone} member={member} visitPoints={visitPoints} storeLinks={storeLinks} initialLive={live} />
            </div>
            <p className="mt-6 text-center text-[14px] text-[var(--vs-ink)]/60">
              Team practice, school or a big group? <a href={`tel:${phone}`} className="font-bold text-[var(--vs-blue)] underline-offset-4 hover:underline">Call {fmtPhone(phone)}</a> and we&apos;ll set it up.
            </p>
          </div>
        </section>

        {/* activities trio */}
        <section className="py-12 md:py-20" aria-label="Things to do">
          <div className="mx-auto flex max-w-[1200px] snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:scroll-px-6 sm:px-6 md:grid md:snap-none md:grid-cols-3 md:gap-4 md:overflow-visible md:pb-0" style={{ scrollbarWidth: "none" }}>
            {c.activities.map((a, i) => (
              <a key={a.id} href={`#${a.id}`} className="vs-reveal group relative block aspect-[4/4.6] w-[80%] shrink-0 snap-start overflow-hidden rounded-[28px] bg-[var(--vs-ink)] text-white sm:w-[46%] md:aspect-[3/4] md:w-auto" data-delay={String(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(6,22,40,.9)] via-[rgba(6,22,40,.25)] to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <div className="font-display text-[15px] font-extrabold uppercase tracking-wider text-[var(--vs-sun)]">{a.tag}</div>
                  <div className="font-display mt-1 text-[34px] font-extrabold leading-none">{a.label}</div>
                  <p className="mt-2 text-[15px] text-white/80">{a.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-extrabold">See more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ── CAGES ────────────────────────────────────────────────── */}
        <section id="cages" className="pb-12 md:pb-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className="vs-reveal relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.cages.photos[0]} alt="The batting cages at Flippo's" loading="lazy" className="aspect-[4/3.2] w-full rounded-[28px] object-cover" />
                {c.cages.photos[1] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cages.photos[1]} alt="Tap-to-play card reader on a cage" loading="lazy" className="absolute -bottom-6 right-4 w-[38%] rotate-[4deg] rounded-[22px] border-[6px] border-white object-cover shadow-xl sm:right-6" />
                )}
                <span className="font-display absolute left-4 top-4 rotate-[-6deg] rounded-2xl bg-[var(--vs-red)] px-4 py-2 text-[22px] font-extrabold text-white shadow-lg">Up to 55 MPH!</span>
              </div>
              <div className="vs-reveal" data-delay="1">
                <span className="vs-tag">Batting cages</span>
                <h2 className="font-display mt-3 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1]">{c.cages.title}</h2>
                <p className="mt-4 text-[18px] leading-relaxed text-[var(--vs-ink)]/80">{c.cages.intro}</p>
                <p className="mt-3 text-[16px] leading-relaxed text-[var(--vs-ink)]/65">{c.cages.body}</p>
                <dl className="mt-6 grid grid-cols-4 gap-2">
                  {c.cages.facts.map(f => (
                    <div key={f.small} className="rounded-2xl bg-[var(--vs-sky-soft)] px-2 py-3 text-center">
                      <dt className="sr-only">{f.small}</dt>
                      <dd className="font-display text-[clamp(18px,2.6vw,28px)] font-extrabold leading-none text-[var(--vs-blue)]">{f.big}</dd>
                      <dd className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--vs-ink)]/60">{f.small}</dd>
                    </div>
                  ))}
                </dl>
                <BookButton category={cageCat} className="mt-7 inline-flex h-[52px] items-center gap-2 rounded-full bg-[var(--vs-blue)] px-6 text-[16px] font-extrabold text-white transition hover:brightness-110 active:scale-[0.98]">
                  Book a cage <ArrowRight className="h-5 w-5" />
                </BookButton>
              </div>
            </div>

            {speedCages.length > 0 && (
              <div className="vs-reveal mt-14">
                <div className="flex items-end justify-between gap-3">
                  <h3 className="font-display text-[26px] font-extrabold leading-tight sm:text-[30px]">Pick your speed</h3>
                  <span className="pb-1 text-[13px] font-semibold text-[var(--vs-ink)]/55">Tap a cage to book it</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-6">
                  {speedCages.map(r => {
                    const tag = /hit\s*t?rax/i.test(r.name) ? "HitTrax" : /softball/i.test(r.name) ? "Softball" : null;
                    const cage = (r.name.match(/cage\s*#?\s*\d+/i)?.[0] ?? r.name).replace(/\s+/g, " ");
                    return (
                      <BookButton key={r.id} resourceId={r.id} ariaLabel={`Book ${r.name}, ${r.mph} miles per hour`}
                        className="group relative flex flex-col items-center rounded-[20px] bg-white px-2 pb-3 pt-3.5 text-center ring-1 ring-[var(--vs-line)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-20px_rgba(11,37,64,.6)] hover:ring-[var(--vs-blue)]/40 active:scale-[0.98]">
                        <SpeedGauge mph={r.mph!} className="h-8 w-[52px] text-[var(--vs-ink)]" />
                        <span className="mt-1.5 flex items-baseline gap-1">
                          <span className="font-display text-[30px] font-extrabold leading-none tabular-nums" style={{ color: speedColor(r.mph!) }}>{r.mph}</span>
                          <span className="text-[11px] font-black uppercase">mph</span>
                        </span>
                        <span className="mt-1 text-[13px] font-extrabold">{cage}</span>
                        {tag && <span className="mt-1 rounded-full bg-[var(--vs-sky-soft)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--vs-blue)]">{tag}</span>}
                      </BookButton>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-12 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
              <div className="vs-reveal overflow-hidden rounded-[28px] bg-white ring-1 ring-[var(--vs-line)]">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-[var(--vs-ink)] px-5 py-4 text-white">
                  <h3 className="font-display whitespace-nowrap text-[22px] font-extrabold">Cage pricing</h3>
                  <span className="whitespace-nowrap rounded-full bg-[var(--vs-sun)] px-3 py-1 text-[11px] font-extrabold text-[var(--vs-ink)] sm:text-[12px]">Tap-to-pay on every cage</span>
                </div>
                <table className="w-full text-left text-[15px] tabular-nums">
                  <thead>
                    <tr className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--vs-ink)]/50">
                      <th className="px-5 py-3 font-extrabold">Time</th><th className="px-2 py-3 font-extrabold">Balls</th><th className="px-2 py-3 font-extrabold">Rate</th><th className="px-5 py-3 text-right font-extrabold">w/ HitTrax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.cages.prices.map(p => (
                      <tr key={p.minutes} className="border-t border-[var(--vs-line)] odd:bg-[var(--vs-paper)]">
                        <td className="px-5 py-3 font-bold">{p.minutes} min</td>
                        <td className="px-2 py-3 text-[var(--vs-ink)]/70">{p.balls}</td>
                        <td className="font-display px-2 py-3 text-[18px] font-extrabold">{p.price}</td>
                        <td className="font-display px-5 py-3 text-right text-[18px] font-extrabold text-[var(--vs-blue)]">{p.hittrax}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="vs-reveal rounded-[28px] bg-[var(--vs-paper)] p-6 ring-1 ring-[var(--vs-line)]" data-delay="1">
                <h3 className="font-display flex items-center gap-2 text-[22px] font-extrabold"><ShieldCheck className="h-6 w-6 text-[var(--vs-blue)]" /> Cage rules</h3>
                <ol className="mt-4 grid gap-3">
                  {c.cages.rules.map((r, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-snug">
                      <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-extrabold text-[var(--vs-blue)] ring-1 ring-[var(--vs-line)]">{i + 1}</span>
                      <span className="pt-0.5">{r}</span>
                    </li>
                  ))}
                </ol>
                {waiver && (
                  <a href={waiver.href} {...waiverExt} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-extrabold ring-1 ring-[var(--vs-line)] hover:ring-[var(--vs-blue)]/50">
                    Sign the waiver <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── ARCADE ───────────────────────────────────────────────── */}
        <section id="arcade" className="relative overflow-hidden bg-[#071a2e] py-12 text-white md:py-24">
          <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-[#7c3aed]/30 blur-[100px]" />
          <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-[var(--vs-sky)]/25 blur-[100px]" />
          <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="vs-reveal max-w-[620px]">
                <span className="vs-tag !bg-white/10 !text-[var(--vs-sky)]">Arcade</span>
                <h2 className="font-display mt-3 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1]">{c.arcade.title}</h2>
                <p className="mt-4 text-[17px] leading-relaxed text-white/75">{c.arcade.intro}</p>
              </div>
              {poolCat && (
                <BookButton category={poolCat} className="vs-reveal inline-flex h-[52px] shrink-0 items-center gap-2 self-start rounded-full bg-white px-6 text-[16px] font-extrabold text-[var(--vs-ink)] transition hover:bg-[var(--vs-sky-soft)] md:self-auto">
                  Book a pool table <ArrowRight className="h-5 w-5" />
                </BookButton>
              )}
            </div>
            <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
              {c.arcade.games.map((g, i) => (
                <figure key={g.name} className={`vs-reveal group relative overflow-hidden rounded-[22px] bg-black ${i === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-auto" : "aspect-[4/3.4]"}`} data-delay={String(i % 3)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.img} alt={g.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-[1.05] group-hover:opacity-100" />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10">
                    <div className="font-display text-[clamp(17px,2vw,22px)] font-extrabold leading-tight">{g.name}</div>
                    <div className="text-[13px] text-white/70">{g.tag}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ── PARTIES ──────────────────────────────────────────────── */}
        <section id="parties" className="py-12 md:py-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
              <div className="vs-reveal">
                <span className="vs-tag">Parties</span>
                <h2 className="font-display mt-3 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1]">{c.parties.title}</h2>
                <p className="mt-4 text-[17px] leading-relaxed text-[var(--vs-ink)]/75">{c.parties.intro}</p>
                <p className="mt-3 text-[15px] font-semibold text-[var(--vs-ink)]/60">From the first swing to the final high score, we make it easy.</p>
              </div>
              <div className="vs-reveal relative overflow-hidden rounded-[28px] bg-[var(--vs-ink)] text-white" data-delay="1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.parties.photo} alt="Kids playing in the arcade" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                <div className="absolute inset-0 bg-gradient-to-r from-[rgba(6,22,40,.9)] via-[rgba(6,22,40,.7)] to-[rgba(6,22,40,.35)]" />
                <div className="relative p-6 sm:p-8">
                  <div className="font-display text-[22px] font-extrabold">Every package includes</div>
                  <ul className="mt-4 grid gap-2.5">
                    {c.parties.includes.map(x => (
                      <li key={x} className="flex items-center gap-3 text-[16px] font-semibold">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--vs-sun)] text-[var(--vs-ink)]"><Star className="h-3.5 w-3.5 fill-current" /></span>{x}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-[13px] text-white/75">{c.parties.fineprint}</p>
                </div>
              </div>
            </div>

            <div className="-mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-4 sm:mx-0 sm:mt-10 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4" style={{ scrollbarWidth: "none" }}>
              {c.parties.packages.map((p, i) => (
                <div key={p.name} className={`vs-reveal relative flex w-[78%] shrink-0 snap-start flex-col rounded-[26px] p-6 sm:w-auto ${p.popular ? "bg-[var(--vs-blue)] text-white shadow-[0_24px_60px_-28px_var(--vs-blue)]" : "bg-white ring-1 ring-[var(--vs-line)]"}`} data-delay={String(i)}>
                  {p.popular && <span className="absolute -top-3 left-6 rounded-full bg-[var(--vs-sun)] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--vs-ink)]">Most popular</span>}
                  <div className="font-display text-[24px] font-extrabold">{p.name}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-display text-[48px] font-extrabold leading-none">${p.price}</span>
                  </div>
                  <div className={`mt-1 text-[13px] font-semibold ${p.popular ? "text-white/80" : "text-[var(--vs-ink)]/55"}`}>Extra guests {p.perGuest} each</div>
                  <ul className="mt-5 grid flex-1 content-start gap-2">
                    {p.perks.map(k => (
                      <li key={k} className="flex items-start gap-2 text-[14px] font-semibold">
                        <Sparkles className={`mt-0.5 h-4 w-4 shrink-0 ${p.popular ? "text-[var(--vs-sun)]" : "text-[var(--vs-blue)]"}`} />{k}
                      </li>
                    ))}
                  </ul>
                  <BookButton category={partyCat} pkg={p.name} ariaLabel={`Book the ${p.name} party`}
                    className={`mt-6 h-12 w-full rounded-2xl text-[15px] font-extrabold transition active:scale-[0.98] ${p.popular ? "bg-white text-[var(--vs-ink)] hover:bg-[var(--vs-sky-soft)]" : "bg-[var(--vs-ink)] text-white hover:brightness-125"}`}>
                    Let&apos;s play! Book it
                  </BookButton>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOD ─────────────────────────────────────────────────── */}
        <section id="food" className="relative overflow-hidden bg-[#fff8dc] py-12 md:py-24">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--vs-sun)]/60" />
          <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6">
            {/* minmax(0,1fr): the menu's swipeable tab row must not stretch the column past the screen. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-10">
              <div className="vs-reveal min-w-0">
                <span className="vs-tag !bg-white !text-[#b45309]">Cafe & beer</span>
                <h2 className="font-display mt-3 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1]">{c.food.title}</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-[var(--vs-ink)]/75 sm:mt-4 sm:text-[17px]">{c.food.intro}</p>
                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:mt-6">
                  {c.food.photos.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={p} alt={i === 0 ? "Hot dog, pizza and pretzel" : "Fresh cheese pizza"} loading="lazy"
                      className={`aspect-[4/3] w-full rounded-[18px] object-cover sm:rounded-[22px] lg:aspect-square ${i === 1 ? "lg:translate-y-6" : ""}`} />
                  ))}
                </div>
                <div className="mt-12 hidden flex-wrap gap-3 lg:flex">{foodButtons}</div>
              </div>
              <div className="vs-reveal min-w-0 rounded-[24px] bg-white p-5 shadow-[0_24px_60px_-36px_rgba(120,80,0,.5)] sm:rounded-[28px] sm:p-8" data-delay="1">
                <MenuBoard sections={c.food.sections} />
                <p className="text-[12px] text-[var(--vs-ink)]/50">Add onions and jalapeños to any meal for $1. Beer and wine for the grown-ups.</p>
              </div>
              {/* Phones: the actions sit under the menu, side by side. */}
              <div className="grid grid-cols-2 gap-2.5 lg:hidden">{foodButtons}</div>
            </div>
          </div>
        </section>

        {/* ── APP ──────────────────────────────────────────────────── */}
        <section id="app" className="vs-rings relative overflow-hidden py-12 text-white md:py-24" style={{ ["--rx" as string]: "92%", ["--ry" as string]: "8%" }}>
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
              <div className="vs-reveal flex flex-col items-start">
                <span className="vs-tag !bg-white/20 !text-white">Free app</span>
                <h2 className="font-display mt-3 text-[clamp(38px,5.4vw,62px)] font-extrabold leading-[0.98] drop-shadow-[0_2px_0_rgba(2,60,100,.25)]">{c.app.title}</h2>
                <p className="mt-4 max-w-[520px] text-[18px] leading-relaxed text-white/90">{c.app.sub}</p>
                {/* Phones: store buttons right under the headline, features after. */}
                <ul className="order-last mt-6 grid w-full grid-cols-2 gap-2.5 sm:gap-3 lg:order-none lg:mt-7">
                  {c.app.features.map((f, i) => {
                    const Icon = [CalendarCheck, Trophy, Gift, Ticket][i % 4];
                    return (
                      <li key={f.title} className="rounded-2xl bg-white/14 p-3.5 ring-1 ring-white/25 backdrop-blur-sm sm:p-4">
                        <Icon className="h-6 w-6 text-[var(--vs-sun)]" />
                        <div className="font-display mt-2 text-[15px] font-extrabold leading-tight sm:text-[17px]">{f.title}</div>
                        <div className="mt-1 text-[13px] leading-snug text-white/85 sm:text-[14px]">{f.body.replace("{visit}", String(visitPoints))}</div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-6 grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3 lg:mt-7">
                  <StoreBadge href={storeLinks.ios} kind="ios" />
                  <StoreBadge href={storeLinks.android} kind="android" />
                  <div className="hidden items-center gap-3 rounded-2xl bg-white p-2 pr-4 text-[var(--vs-ink)] shadow-lg lg:flex">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.app.qr} alt={`QR code to get the ${c.shortName} app`} className="h-14 w-14" />
                    <span className="font-display text-[14px] font-extrabold leading-tight">Scan with<br />your phone</span>
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-white/85">Look for <b>AE Rewards</b>, then join {c.shortName} with code <b className="tracking-wider">{storeLinks.joinCode}</b>.</p>
              </div>

              <div className="vs-reveal relative" data-delay="1">
                <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_40px_90px_-40px_rgba(2,40,80,.9)] ring-4 ring-white/40">
                  <div className="aspect-video">
                    <LoopVideo src={c.app.video} poster={c.app.poster} sound label={`${c.shortName} app preview`} className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>
            </div>

            {rewards.length > 0 && (
              <div className="vs-reveal mt-20">
                <div className="flex items-end justify-between gap-4">
                  <h3 className="font-display text-[26px] font-extrabold">Rewards waiting in the app</h3>
                  <span className="hidden text-[14px] font-semibold text-white/85 sm:block">+{visitPoints} points every visit</span>
                </div>
                <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6" style={{ scrollbarWidth: "none" }}>
                  <ul className="flex w-max gap-3">
                    {rewards.map(r => (
                      <li key={r.id} className="w-[170px] shrink-0 overflow-hidden rounded-[22px] bg-white text-[var(--vs-ink)] shadow-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={optimizedUrl(r.image_url, 340)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        <div className="p-3">
                          <div className="line-clamp-2 min-h-[36px] text-[14px] font-bold leading-tight">{r.name}</div>
                          <div className="mt-1.5 inline-flex rounded-full bg-[var(--vs-sky-soft)] px-2 py-0.5 text-[12px] font-extrabold text-[var(--vs-blue)]">{r.point_cost.toLocaleString()} pts</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── ABOUT ────────────────────────────────────────────────── */}
        <section id="about" className="py-12 md:py-24">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr]">
            <div className="vs-reveal relative order-2 lg:order-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.about.photo} alt={`${c.shortName} storefront on grand opening day`} loading="lazy" className="aspect-[4/3] w-[82%] rounded-[28px] object-cover" />
              <div className="absolute -bottom-6 right-0 w-[42%] max-w-[240px] overflow-hidden rounded-[30px] border-[6px] border-[var(--vs-ink)] bg-black shadow-2xl">
                <div className="aspect-[9/16]">
                  <LoopVideo src={c.reel.video} poster={c.reel.poster} sound label={`${c.shortName} video tour`} className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
            <div className="vs-reveal order-1 lg:order-2" data-delay="1">
              <span className="vs-tag">Why {c.shortName}</span>
              <h2 className="font-display mt-3 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1]">{c.about.title}</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-[var(--vs-ink)]/75">{c.about.body}</p>
              <ul className="mt-6 grid gap-4">
                {c.about.points.map((p, i) => {
                  const Icon = [ShieldCheck, Users, Utensils][i % 3];
                  return (
                    <li key={p.title} className="flex gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--vs-sky-soft)] text-[var(--vs-blue)]"><Icon className="h-6 w-6" /></span>
                      <span>
                        <span className="font-display block text-[19px] font-extrabold">{p.title}</span>
                        <span className="block text-[15px] leading-snug text-[var(--vs-ink)]/70">{p.body}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* waiver band */}
        {waiver && (
          <section className="px-4 sm:px-6" aria-label="Waiver">
            <div className="vs-reveal mx-auto flex max-w-[1200px] flex-col items-start gap-5 overflow-hidden rounded-[28px] bg-[var(--vs-red)] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
              <div>
                <div className="font-display text-[clamp(26px,3.4vw,38px)] font-extrabold leading-tight">Coming in to hit? Sign your waiver first.</div>
                <p className="mt-1 text-[16px] text-white/90">
                  Takes a minute on your phone, no app or account needed{waiver.validDays ? `, and it's good for ${waiver.validDays >= 365 ? "a whole year" : `${waiver.validDays} days`}` : ""}. Skip the line at the counter.
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-center">
                <a href={waiver.href} {...waiverExt} className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-7 text-[17px] font-extrabold text-[var(--vs-ink)] hover:bg-[var(--vs-sky-soft)]">
                  Sign waiver now <ArrowRight className="h-5 w-5" />
                </a>
                {waiver.signInHref && (
                  <a href={waiver.signInHref} className="text-center text-[14px] font-bold text-white/90 underline-offset-4 hover:underline">Already in the app? Sign in</a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── VISIT ────────────────────────────────────────────────── */}
        <section id="visit" className="py-12 md:py-24">
          <div className="mx-auto grid max-w-[1200px] gap-5 px-4 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
            <div className="vs-reveal min-w-0 overflow-hidden rounded-[28px] bg-[var(--vs-sky-soft)] ring-1 ring-[var(--vs-line)]">
              <iframe title={`Map to ${c.shortName}`} src={`https://www.google.com/maps?q=${mapsQ}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-[340px] w-full border-0 lg:h-full lg:min-h-[440px]" />
            </div>
            <div className="vs-reveal min-w-0 rounded-[28px] bg-[var(--vs-ink)] p-6 text-white sm:p-7" data-delay="1">
              <span className="vs-tag !bg-white/10 !text-[var(--vs-sky)]">Visit us</span>
              <h2 className="font-display mt-3 text-[40px] font-extrabold leading-none">Come play</h2>
              <address className="mt-5 not-italic">
                <div className="flex gap-3 text-[17px] font-semibold"><MapPin className="mt-1 h-5 w-5 shrink-0 text-[var(--vs-sky)]" />{address}</div>
                <a href={`tel:${phone}`} className="mt-3 flex gap-3 text-[17px] font-semibold tabular-nums hover:text-[var(--vs-sky)]"><Phone className="mt-0.5 h-5 w-5 shrink-0 text-[var(--vs-sky)]" />{fmtPhone(phone)}</a>
              </address>
              <div className="mt-6 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wider text-white/60"><Clock className="h-4 w-4" /> Hours</span>
                  <OpenNow hours={c.hours} timezone={c.timezone} className="text-[13px] font-bold" />
                </div>
                <dl className="mt-3 grid gap-2">
                  {c.hours.map(h => (
                    <div key={h.label} className="flex justify-between gap-4 text-[16px]"><dt className="font-semibold text-white/80">{h.label}</dt><dd className="font-bold tabular-nums">{hoursLine(h)}</dd></div>
                  ))}
                </dl>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQ}`} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-[13px] font-extrabold text-[var(--vs-ink)] hover:bg-[var(--vs-sky-soft)]"><Navigation className="h-5 w-5 text-[var(--vs-blue)]" />Directions</a>
                <a href={`tel:${phone}`} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-[13px] font-extrabold text-[var(--vs-ink)] hover:bg-[var(--vs-sky-soft)]"><Phone className="h-5 w-5 text-[var(--vs-blue)]" />Call</a>
                <a href={`sms:${phone}`} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-[13px] font-extrabold text-[var(--vs-ink)] hover:bg-[var(--vs-sky-soft)]"><MessageCircle className="h-5 w-5 text-[var(--vs-blue)]" />Text</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#061628] pb-20 text-white/75 md:pb-0">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-16 w-auto rounded-2xl bg-white p-2" />
            )}
            <p className="mt-4 max-w-[340px] text-[15px] leading-relaxed">Batting cages, arcade, cafe and beer in {c.city}. Fun for the whole family.</p>
            <BookButton className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--vs-red)] px-6 text-[15px] font-extrabold text-white">Book now <ArrowRight className="h-4 w-4" /></BookButton>
          </div>
          <nav aria-label="Footer">
            <div className="font-display text-[15px] font-extrabold uppercase tracking-wider text-white">Explore</div>
            <ul className="mt-3 grid gap-2 text-[15px]">
              {links.map(l => <li key={l.href}><a href={l.href} className="hover:text-white">{l.label}</a></li>)}
              {waiver && <li><a href={waiver.href} {...waiverExt} className="hover:text-white">Waiver</a></li>}
            </ul>
          </nav>
          <div>
            <div className="font-display text-[15px] font-extrabold uppercase tracking-wider text-white">Hours</div>
            <dl className="mt-3 grid gap-1.5 text-[15px]">
              {c.hours.map(h => <div key={h.label} className="flex justify-between gap-4"><dt>{h.label}</dt><dd className="tabular-nums text-white">{hoursLine(h)}</dd></div>)}
            </dl>
            <div className="mt-4 text-[15px]">{address}<br /><a href={`tel:${phone}`} className="tabular-nums text-white hover:underline">{fmtPhone(phone)}</a></div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-5 text-[13px] text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} {name.trim()}</span>
            <span>Website, booking & app by <a href="https://www.atlas-engine.app" target="_blank" rel="noopener" className="font-semibold text-white/75 hover:text-white">Atlas Engine</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StoreBadge({ href, kind }: { href: string; kind: "ios" | "android" }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-black px-3 text-white sm:justify-start sm:gap-3 sm:px-4 sm:pr-5 shadow-lg ring-1 ring-white/20 transition hover:scale-[1.02]">
      {kind === "ios" ? (
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true"><path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C4.02 18.38 3 15.57 3 12.92c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.62 0 2.89.06 4.38 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.95 4.45z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true"><path fill="#34d399" d="M3.6 1.9 13.5 12 3.6 22.1A1.6 1.6 0 0 1 3 20.9V3.1c0-.5.2-.9.6-1.2z" /><path fill="#60a5fa" d="M16.8 8.7 13.5 12 3.6 1.9c.4-.3 1-.3 1.6 0z" /><path fill="#f87171" d="M16.8 15.3 5.2 22.1c-.6.3-1.2.3-1.6 0L13.5 12z" /><path fill="#fbbf24" d="m20.4 10.6-3.6-1.9L13.5 12l3.3 3.3 3.6-1.9c1.1-.6 1.1-2.2 0-2.8z" /></svg>
      )}
      <span className="leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/70">{kind === "ios" ? "Download on the" : "Get it on"}</span>
        <span className="block text-[16px] font-bold sm:text-[18px]">{kind === "ios" ? "App Store" : "Google Play"}</span>
      </span>
    </a>
  );
}
