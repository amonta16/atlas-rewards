import { optimizedUrl } from "@/lib/img";
import { venuePhotos } from "@/lib/landing/venues";

/**
 * Venue gallery — CP-176 (replaces the icon chip strip).
 * Real photos of the places Atlas is built for, drifting past in a slow
 * marquee (pauses on hover; static scroll row with reduced motion).
 * Photos: lib/landing/venues.ts — add more with scripts/fetch-landing-photos.mjs.
 */
export function VenueGallery() {
  const photos = venuePhotos();
  const loop = [...photos, ...photos];
  return (
    <section className="pb-6 pt-10 md:pt-14" aria-labelledby="venues-title">
      <div className="lp-container">
        <p id="venues-title" className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Built for the places people go to have fun
        </p>
      </div>
      <div className="lp-marquee group relative mt-7 overflow-hidden" role="list" aria-label="Venue types">
        <div className="lp-marquee-track flex w-max gap-4 group-hover:[animation-play-state:paused]">
          {loop.map((p, i) => (
            <figure
              key={`${p.key}-${i}`}
              role={i < photos.length ? "listitem" : undefined}
              aria-hidden={i >= photos.length ? true : undefined}
              className="relative h-[260px] w-[190px] shrink-0 overflow-hidden rounded-[1.4rem] bg-slate-200 shadow-[0_18px_40px_-24px_rgba(20,33,61,0.6)] sm:h-[300px] sm:w-[220px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizedUrl(p.src, 440)}
                alt={i < photos.length ? `${p.label}${p.credit ? ` — photo: ${p.credit}` : ""}` : ""}
                loading={i < 5 ? "eager" : "lazy"}
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 pt-12 text-[15px] font-semibold text-white">
                {p.label}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white sm:w-24" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white sm:w-24" aria-hidden />
      </div>
      <p className="lp-container mt-6 text-center text-sm text-slate-500">
        Arcades, batting cages, go-karts, bowling, trampoline parks and party venues. Also running in smoke shops, med spas and cafes.
      </p>
    </section>
  );
}
