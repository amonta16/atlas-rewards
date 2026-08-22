import { Reveal } from "./reveal";

/**
 * Trust strip — CP-100. Every tile is a placeholder until real logos land.
 * Swap each `[ CUSTOMER LOGO ]` for an <img> (SVG/PNG, ~140×40, monochrome white).
 */
const SLOTS = 6;

export function LogoCloud() {
  return (
    <section className="relative py-10 md:py-14" aria-label="Businesses using Atlas">
      <Reveal className="lp-container">
        <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Built for the businesses people visit every week
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: SLOTS }).map((_, i) => (
            <li
              key={i}
              className="lp-placeholder grid h-14 place-items-center rounded-lg text-[11px] tracking-wide text-zinc-500"
            >
              [ CUSTOMER LOGO ]
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
