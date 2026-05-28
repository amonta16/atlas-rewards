import { cn } from "@/lib/utils";

type Tone = "indigo" | "emerald" | "amber" | "rose" | "cyan";

const TONES: Record<Tone, { bg: string; text: string }> = {
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-600" },
  cyan:    { bg: "bg-cyan-50",    text: "text-cyan-600" },
};

export function StatCard({
  icon, label, value, tone = "indigo", trend, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: Tone;
  trend?: string;
  /** Smaller line beneath the label — used for context like "12 active plans". */
  sub?: string;
}) {
  const t = TONES[tone];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow ring-1 ring-slate-100/60">
      <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset", t.bg, t.text, "ring-current/10")}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">{value}</div>
        <div className="text-sm font-semibold text-slate-600 truncate">{label}</div>
        {sub   && <div className="text-[11.5px] text-slate-500 mt-0.5 truncate">{sub}</div>}
        {trend && <div className="text-xs font-bold text-emerald-600 mt-1">{trend}</div>}
      </div>
    </div>
  );
}
