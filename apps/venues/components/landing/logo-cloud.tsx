import { Reveal } from "./reveal";

/**
 * Trust strip — CP-103. First tile is real (Exotic Smoke Shop, live since
 * Aug 2026); the rest stay placeholders until more launches land. Swap a
 * placeholder for a real one by adding to LIVE (name + optional sub).
 */
const LIVE: Array<{ name: string; sub: string }> = [
  { name: "EXOTIC SMOKE SHOP", sub: "San Luis Obispo · live" },
];
const PLACEHOLDER_SLOTS = 5;

export function LogoCloud() {
  return (
    <section className="relative py-10 md:py-14" aria-label="Businesses using Atlas">
      <Reveal className="lp-container">
        <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          Built for the businesses people visit every week
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {LIVE.map((b) => (
            <li key={b.name} className="lp-light grid h-14 place-items-center rounded-lg border border-white/40 bg-white/90 px-2 text-center">
              <span>
                <span className="block text-[11px] font-bold leading-tight tracking-wide text-[#14213d]">{b.name}</span>
                <span className="block text-[9px] font-medium uppercase tracking-wider text-[#1f5f8b]">{b.sub}</span>
              </span>
            </li>
          ))}
          {Array.from({ length: PLACEHOLDER_SLOTS }).map((_, i) => (
            <li
              key={i}
              className="lp-placeholder grid h-14 place-items-center rounded-lg text-[11px] tracking-wide text-slate-500"
            >
              [ CUSTOMER LOGO ]
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

// CP-102: ocean palette pass — tokens + light-surface remaps live in app/globals.css.
