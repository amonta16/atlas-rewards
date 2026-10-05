/**
 * CycleDial — CP-183 hero. One patient's 12-week neurotoxin cycle drawn as a
 * dial: the arc sweeps from her visit to week 10, the "due" point pulses, and
 * the reminder she'd get slides in, then the booking it produces. One
 * orchestrated sequence on load (CSS only); static for reduced motion.
 * Illustrative: "Maya" and "Luma Aesthetics" are the fictional demo practice.
 */
const R = 150;
const C = 2 * Math.PI * R; // circumference
const DUE_WEEK = 10;
const ARC = (DUE_WEEK / 12) * C;
const pt = (week: number, r = R) => {
  const a = ((-90 + (week / 12) * 360) * Math.PI) / 180;
  return { x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a) };
};

export function CycleDial() {
  const due = pt(DUE_WEEK);
  const ticks = Array.from({ length: 12 }, (_, w) => ({ w, a: pt(w, R - 16), b: pt(w, R - 6) }));
  const visit = pt(0, R + 30);
  const dueLabel = pt(DUE_WEEK, R + 30);
  return (
    <figure className="relative mx-auto w-full max-w-[520px]" aria-label="A patient's 12-week treatment cycle: at week 10 Atlas sends a reminder and she books.">
      <svg viewBox="-20 0 440 400" className="w-full" role="img" aria-hidden>
        <circle cx="200" cy="200" r={R + 34} fill="#fff" opacity=".55" />
        <circle cx="200" cy="200" r={R} fill="none" stroke="var(--ms-mist)" strokeWidth="14" />
        {ticks.map(({ w, a, b }) => (
          <line key={w} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ms-champagne)" strokeWidth={w % 3 === 0 ? 2 : 1} opacity={w % 3 === 0 ? 0.9 : 0.5} />
        ))}
        <text x={visit.x} y={visit.y + 2} textAnchor="middle" fontSize="13" fill="var(--ms-ink-3)" fontFamily="var(--font-ms-body)">Treatment</text>
        <text x={dueLabel.x - 6} y={dueLabel.y} textAnchor="end" fontSize="13" fontWeight="600" fill="var(--ms-quartz)" fontFamily="var(--font-ms-body)" className="ms-fade-in">Due</text>
        {/* the sweep: visit → due */}
        <circle
          cx="200" cy="200" r={R} fill="none" stroke="var(--ms-ink)" strokeWidth="14" strokeLinecap="round"
          transform="rotate(-90 200 200)"
          strokeDasharray={`${C} ${C}`}
          className="ms-sweep"
          style={{ ["--ms-arc-len" as string]: `${C}`, ["--ms-arc-stop" as string]: `${C - ARC}`, strokeDashoffset: C - ARC }}
        />
        <circle cx={pt(0).x} cy={pt(0).y} r="9" fill="#fff" stroke="var(--ms-ink)" strokeWidth="4" />
        <circle cx={due.x} cy={due.y} r="9" fill="var(--ms-quartz)" className="ms-pulse" />
        <circle cx={due.x} cy={due.y} r="10" fill="var(--ms-quartz)" stroke="#fff" strokeWidth="4" className="ms-fade-in" />
        <text x="200" y="184" textAnchor="middle" fontSize="13" fill="var(--ms-ink-3)" fontFamily="var(--font-ms-body)">Week {DUE_WEEK} of 12</text>
        <text x="200" y="222" textAnchor="middle" fontSize="30" fill="var(--ms-ink)" fontFamily="var(--font-ms-display)" style={{ fontVariationSettings: '"opsz" 72, "SOFT" 60' }}>Maya is due</text>
      </svg>

      {/* What she gets, then what happens */}
      <div className="absolute -bottom-24 right-0 w-[86%] max-w-[330px] space-y-2.5 sm:-bottom-6 sm:-right-6 sm:w-[78%]">
        <div className="ms-rise-1 rounded-[20px] bg-white/95 p-3.5 shadow-[0_20px_50px_-24px_rgba(14,36,51,.45)] ring-1 ring-black/5 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#9f6b53] text-[13px] font-semibold text-white">LA</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-[12px] text-[var(--ms-ink-3)]"><span className="font-semibold text-[var(--ms-ink)]">Luma Aesthetics</span><span>now</span></div>
              <p className="mt-0.5 text-[13.5px] leading-snug text-[var(--ms-ink)]">Maya, your refresh is due this week. Book by Friday and your LED add-on is on us.</p>
            </div>
          </div>
        </div>
        <div className="ms-rise-2 ml-auto flex w-fit items-center gap-2.5 rounded-full bg-[var(--ms-ink)] py-2 pl-2.5 pr-4 text-[13px] text-white shadow-lg">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#3fb68b]" aria-hidden>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          Booked for Thursday, 2:30
        </div>
      </div>
    </figure>
  );
}
