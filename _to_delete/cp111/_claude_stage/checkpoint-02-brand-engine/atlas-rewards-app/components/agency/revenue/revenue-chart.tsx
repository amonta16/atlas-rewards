"use client";
/**
 * revenue-chart.tsx — CP-111
 *
 * Dependency-free multi-series line chart comparing Actual Live MRR vs
 * Raw and Probability-Weighted Pipeline MRR. Same hand-rolled-SVG
 * approach as components/agency/charts.tsx (CP-50) — no chart library.
 *
 * Honesty rules: each series only draws the dates it really has. Live
 * MRR history is reconstructed from real subscription start/cancel
 * records; pipeline history exists only from the first recorded
 * snapshot forward — earlier days are simply absent, never invented.
 */
import { useMemo, useRef, useState } from "react";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  /** date → cents. Dates are YYYY-MM-DD. */
  points: { date: string; value: number }[];
};

const PAD_L = 46, PAD_R = 12, PAD_T = 14, PAD_B = 26;

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function yTicks(max: number): number[] {
  if (max <= 0) return [0];
  const steps = [1, 2, 2.5, 5];
  const target = max / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  let step = mag;
  for (const s of steps) {
    if (s * mag >= target) { step = s * mag; break; }
    step = 10 * mag;
  }
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function RevenueChart({
  series, formatValue, height = 260,
}: {
  series: ChartSeries[];
  formatValue: (cents: number) => string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Union of all dates, sorted — the shared x-axis.
  const dates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) set.add(p.date);
    return Array.from(set).sort();
  }, [series]);

  const maps = useMemo(
    () => series.map(s => new Map(s.points.map(p => [p.date, p.value]))),
    [series]);

  const w = 860, h = height;
  const innerW = w - PAD_L - PAD_R, innerH = h - PAD_T - PAD_B;
  const max = Math.max(100, ...series.flatMap(s => s.points.map(p => p.value)));
  const ticks = yTicks(max);
  const yMax = ticks[ticks.length - 1] || max;

  const x = (i: number) => PAD_L + (dates.length > 1 ? (i / (dates.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => PAD_T + (1 - v / yMax) * innerH;

  const paths = useMemo(() => series.map((s, si) => {
    let d = "";
    let started = false;
    dates.forEach((date, i) => {
      const v = maps[si].get(date);
      if (v == null) { started = false; return; }
      d += `${started ? " L" : " M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      started = true;
    });
    return d.trim();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, dates, maps, yMax]);

  const hasData = dates.length >= 2;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hasData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const rel = (px - PAD_L) / innerW;
    const idx = Math.round(rel * (dates.length - 1));
    setHoverIdx(Math.min(dates.length - 1, Math.max(0, idx)));
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-10 text-center">
        <div className="text-sm font-semibold text-white">Not enough history yet</div>
        <div className="text-[12px] text-sky-200/50 mt-1 max-w-md mx-auto">
          The chart draws only real recorded values. Live MRR builds from your
          subscription records; pipeline history starts recording from today
          forward — check back after a few days of activity.
        </div>
      </div>
    );
  }

  const hover = hoverIdx != null ? dates[hoverIdx] : null;

  return (
    <div ref={wrapRef} className="relative">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        {series.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-sky-100/80">
            <span className="inline-block h-0.5 w-5 rounded-full" style={{
              background: s.color,
              ...(s.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)`, backgroundColor: "transparent" } : {}),
            }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={"Chart comparing " + series.map(s => s.label).join(", ")}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid + y labels */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)}
              stroke="rgba(148,197,255,0.10)" strokeWidth="1" />
            <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end"
              fontSize="10" fill="rgba(186,230,253,0.45)">
              {formatValue(t)}
            </text>
          </g>
        ))}

        {/* X labels — first, middle, last */}
        {[0, Math.floor((dates.length - 1) / 2), dates.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map(i => (
            <text key={i} x={x(i)} y={h - 8} textAnchor="middle"
              fontSize="10" fill="rgba(186,230,253,0.45)">
              {shortDate(dates[i])}
            </text>
          ))}

        {/* Series lines */}
        {series.map((s, si) => paths[si] && (
          <path key={s.key} d={paths[si]} fill="none" stroke={s.color} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={s.dashed ? "5 4" : undefined}
            style={{ filter: `drop-shadow(0 0 5px ${s.color}55)` }} />
        ))}

        {/* Hover crosshair + dots */}
        {hoverIdx != null && (
          <g>
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD_T} y2={h - PAD_B}
              stroke="rgba(186,230,253,0.35)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s, si) => {
              const v = maps[si].get(dates[hoverIdx]);
              return v == null ? null : (
                <circle key={s.key} cx={x(hoverIdx)} cy={y(v)} r="3.5"
                  fill={s.color} stroke="#04132a" strokeWidth="1.5" />
              );
            })}
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hover && hoverIdx != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg px-3 py-2 text-[12px] z-10"
          style={{
            left: `calc(${((x(hoverIdx) / w) * 100).toFixed(2)}% ${x(hoverIdx) > w * 0.6 ? "- 160px" : "+ 10px"})`,
            background: "rgba(4,19,42,0.95)",
            border: "1px solid rgba(56,189,248,0.3)",
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.8)",
          }}
        >
          <div className="font-bold text-white mb-1">{shortDate(hover)}</div>
          {series.map((s, si) => {
            const v = maps[si].get(hover);
            return (
              <div key={s.key} className="flex items-center gap-2 text-sky-100/80 tabular-nums">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="flex-1 pr-3">{s.label}</span>
                <span className="font-semibold text-white">{v != null ? formatValue(v) : "not recorded"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
