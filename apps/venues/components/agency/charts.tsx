"use client";
/**
 * charts.tsx — CP-50
 *
 * Dependency-free SVG charts for the dark agency command center. All
 * tuned for a near-black navy background with an Atlas ocean-blue glow.
 * No chart library — same approach as the existing MiniChart.
 *
 *   AreaTrend  — MRR growth line/area
 *   BarsOverTime — revenue per month (vertical bars)
 *   RankBars   — MRR by business (horizontal ranked bars)
 *   Funnel     — pipeline stages
 */

const GLOW = "#38bdf8";  // sky-400 — the accent glow
const GLOW2 = "#22d3ee"; // cyan-400

function ChartCard({
  title, subtitle, right, children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl p-5 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(56,189,248,0.06), rgba(255,255,255,0.02))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 30px -12px rgba(0,0,0,0.6)",
        border: "1px solid rgba(56,189,248,0.14)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full blur-3xl opacity-30"
        style={{ background: GLOW }}
      />
      <div className="relative flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-sky-200/60 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/* ───────────────────────── Area / line trend ───────────────────────── */
export function AreaTrend({
  title, subtitle, data, formatValue, right,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
  right?: React.ReactNode;
}) {
  const w = 720, h = 200, padX = 8, padTop = 16, padBottom = 28;
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length;
  const step = n > 1 ? (w - padX * 2) / (n - 1) : 0;
  const pts = data.map((d, i) => {
    const x = padX + i * step;
    const y = padTop + (1 - d.value / max) * (h - padTop - padBottom);
    return [x, y] as const;
  });
  let line = "", area = "";
  if (pts.length) {
    line = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1], [cx, cy] = pts[i];
      const mx = (px + cx) / 2;
      line += ` C ${mx} ${py}, ${mx} ${cy}, ${cx} ${cy}`;
    }
    area = `${line} L ${pts[pts.length - 1][0]} ${h - padBottom} L ${pts[0][0]} ${h - padBottom} Z`;
  }
  const last = data[n - 1]?.value ?? 0;

  return (
    <ChartCard title={title} subtitle={subtitle} right={right ?? (
      <div className="text-right">
        <div className="text-lg font-extrabold text-white tabular-nums">{formatValue(last)}</div>
        <div className="text-[10px] uppercase tracking-widest text-sky-200/50">now</div>
      </div>
    )}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 200 }}>
        <defs>
          <linearGradient id="areaTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GLOW} stopOpacity="0.45" />
            <stop offset="100%" stopColor={GLOW} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1={padX} x2={w - padX} y1={padTop + g * (h - padTop - padBottom)} y2={padTop + g * (h - padTop - padBottom)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {area && <path d={area} fill="url(#areaTrendFill)" />}
        {line && <path d={line} fill="none" stroke={GLOW} strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${GLOW})` }} />}
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === n - 1 ? 4 : 2.5} fill="#fff"
            style={i === n - 1 ? { filter: `drop-shadow(0 0 5px ${GLOW})` } : undefined} />
        ))}
        {data.map((d, i) => (
          <text key={i} x={padX + i * step} y={h - 8} textAnchor="middle"
            fontSize="11" fill="rgba(186,230,253,0.55)">{d.label}</text>
        ))}
      </svg>
    </ChartCard>
  );
}

/* ───────────────────────── Vertical bars over time ─────────────────── */
export function BarsOverTime({
  title, subtitle, data, formatValue,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <div className="flex items-end justify-between gap-2" style={{ height: 180 }}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
              <div className="text-[10px] font-bold text-sky-100/80 mb-1 tabular-nums opacity-0 group-hover:opacity-100 transition">
                {formatValue(d.value)}
              </div>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: `linear-gradient(180deg, ${GLOW2}, ${GLOW} 60%, rgba(29,111,165,0.5))`,
                  boxShadow: `0 0 14px -2px ${GLOW}80`,
                }}
              />
              <div className="text-[10px] text-sky-200/50 mt-1.5">{d.label}</div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

/* ───────────────────────── Horizontal ranked bars ──────────────────── */
export function RankBars({
  title, subtitle, data, formatValue, emptyHint,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number; sub?: string; active?: boolean }[];
  formatValue: (n: number) => string;
  emptyHint?: string;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <ChartCard title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <div className="text-sm text-sky-200/50 py-8 text-center">{emptyHint ?? "No data yet."}</div>
      ) : (
        <div className="space-y-3">
          {data.map((d, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="font-semibold text-white truncate flex items-center gap-1.5">
                  {!d.active && <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" title="Not active" />}
                  {d.label}
                </span>
                <span className="tabular-nums text-sky-100/90 font-bold shrink-0">{formatValue(d.value)}{d.sub && <span className="text-sky-200/40 font-normal ml-1">{d.sub}</span>}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${(d.value / max) * 100}%`,
                    background: d.active
                      ? `linear-gradient(90deg, rgba(29,111,165,0.7), ${GLOW})`
                      : "linear-gradient(90deg, rgba(245,158,11,0.4), rgba(245,158,11,0.7))",
                    boxShadow: d.active ? `0 0 10px -1px ${GLOW}80` : undefined,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

/* ───────────────────────── Pipeline funnel ─────────────────────────── */
export function Funnel({
  title, subtitle, stages, formatValue,
}: {
  title: string;
  subtitle?: string;
  stages: { label: string; count: number; value: number }[];
  formatValue: (n: number) => string;
}) {
  const maxCount = Math.max(1, ...stages.map(s => s.count));
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <div className="space-y-2">
        {stages.map((s, i) => {
          const widthPct = 30 + (s.count / maxCount) * 70;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-20 text-[11px] font-semibold text-sky-200/70 shrink-0 text-right">{s.label}</div>
              <div className="flex-1">
                <div
                  className="h-9 rounded-lg flex items-center justify-between px-3 transition-all"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, rgba(29,111,165,0.55), ${GLOW}${i === stages.length - 1 ? "" : "cc"})`,
                    boxShadow: `0 0 14px -4px ${GLOW}`,
                  }}
                >
                  <span className="text-sm font-extrabold text-white tabular-nums">{s.count}</span>
                  {s.value > 0 && <span className="text-[10px] text-white/80 tabular-nums">{formatValue(s.value)}/mo</span>}
                </div>
              </div>
            </div>
          );
        })}
        {stages.every(s => s.count === 0) && (
          <div className="text-sm text-sky-200/50 py-6 text-center">
            No prospects yet — add leads on the Pipeline page.
          </div>
        )}
      </div>
    </ChartCard>
  );
}
