"use client";

/**
 * Lightweight inline SVG line/area chart — no library dependencies.
 * Takes an array of numbers and renders a smooth filled area.
 */
export function MiniChart({
  values, color, height = 80, label,
}: { values: number[]; color: string; height?: number; label?: string }) {
  const w = 800; // viewBox width
  const h = height;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 8) - 4;
    return [x, y] as const;
  });

  // Build smooth path via cubic bezier midpoints
  let line = "";
  let area = "";
  if (points.length > 0) {
    line = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [px, py] = points[i - 1];
      const [cx, cy] = points[i];
      const mx = (px + cx) / 2;
      line += ` C ${mx} ${py}, ${mx} ${cy}, ${cx} ${cy}`;
    }
    area = `${line} L ${w} ${h} L 0 ${h} Z`;
  }

  return (
    <div>
      {label && <div className="text-xs text-muted-foreground mb-1">{label}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full block" style={{ height }}>
        <defs>
          <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#grad-${color.replace("#","")})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </div>
  );
}
