import { CarFront, Flag, Gamepad2, PartyPopper, Target, Tent } from "lucide-react";
import { Reveal } from "./reveal";

/**
 * Niche strip — CP-146. Entertainment sub-types first; one line for the
 * secondary layouts the reps still sell.
 */
const VENUES = [
  { icon: Gamepad2, label: "Arcades" },
  { icon: Target, label: "Batting cages" },
  { icon: CarFront, label: "Go-karts" },
  { icon: Flag, label: "Mini golf" },
  { icon: Tent, label: "Trampoline parks" },
  { icon: PartyPopper, label: "Party venues" },
];

export function NicheStrip() {
  return (
    <section className="py-12 md:py-16" aria-label="Who Atlas is for">
      <Reveal className="lp-container">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Built for family entertainment centers</p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {VENUES.map(({ icon: I, label }) => (
            <li key={label} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e3e9f0] bg-white px-4 text-sm font-medium text-[#14213d]">
              <I className="h-4 w-4 text-[#1f5f8b]" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-center text-sm text-slate-500">Also running in smoke shops, med spas and cafes.</p>
      </Reveal>
    </section>
  );
}
