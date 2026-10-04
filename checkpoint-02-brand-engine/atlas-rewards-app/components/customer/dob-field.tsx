"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * DobField — three numeric boxes (MM / DD / YYYY) instead of <input type="date">.
 *
 * The native date picker is built for picking next Tuesday: to reach a birth
 * year it means scrolling back decades on a tablet. Typing 4 · 1 · 1 9 9 0 on
 * the number pad takes two seconds, and focus jumps to the next box on its
 * own. Emits "YYYY-MM-DD" only when the date is real and not in the future,
 * otherwise "" — so callers keep their existing string handling.
 */
function daysIn(m: number, y: number) { return new Date(y, m, 0).getDate(); }

function compose(mm: string, dd: string, yyyy: string): string {
  if (yyyy.length !== 4 || !mm || !dd) return "";
  const m = +mm, d = +dd, y = +yyyy;
  if (m < 1 || m > 12 || y < 1900 || d < 1 || d > daysIn(m, y)) return "";
  const iso = `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(t.getTime()) || t.getTime() > Date.now()) return "";
  return iso;
}

export function DobField({
  value, onChange, ariaLabel = "Date of birth", size = "lg", className,
}: {
  value: string; onChange: (iso: string) => void; ariaLabel?: string; size?: "lg" | "md"; className?: string;
}) {
  const [y0, m0, d0] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-") : ["", "", ""];
  const [mm, setMm] = useState(m0);
  const [dd, setDd] = useState(d0);
  const [yyyy, setYyyy] = useState(y0);
  const dRef = useRef<HTMLInputElement>(null);
  const yRef = useRef<HTMLInputElement>(null);

  // Parent reset (e.g. "Next person") or programmatic change → mirror it.
  useEffect(() => {
    if (value !== compose(mm, dd, yyyy)) {
      const [a, b, c] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-") : ["", "", ""];
      setYyyy(a); setMm(b); setDd(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function push(m: string, d: string, y: string) { onChange(compose(m, d, y)); }

  const full = mm.length > 0 && dd.length > 0 && yyyy.length === 4;
  const bad = full && compose(mm, dd, yyyy) === "";
  const box = cn(
    "rounded-md border bg-white text-center font-semibold tabular-nums outline-none focus:ring-2 focus:ring-offset-0",
    size === "lg" ? "h-16 text-xl" : "h-12 text-lg",
    bad ? "border-red-400 focus:ring-red-300" : "border-input focus:ring-zinc-300",
  );

  return (
    <div className={className}>
      <div role="group" aria-label={ariaLabel} className="flex items-center gap-2">
        <input className={cn(box, "w-[28%]")} inputMode="numeric" autoComplete="off" placeholder="MM" aria-label="Month" maxLength={2}
          value={mm}
          onChange={e => {
            let v = e.target.value.replace(/\D/g, "").slice(0, 2);
            if (v.length === 1 && +v > 1) v = "0" + v;
            setMm(v); push(v, dd, yyyy);
            if (v.length === 2) dRef.current?.focus();
          }} />
        <span className="text-zinc-300 text-xl">/</span>
        <input ref={dRef} className={cn(box, "w-[28%]")} inputMode="numeric" autoComplete="off" placeholder="DD" aria-label="Day" maxLength={2}
          value={dd}
          onChange={e => {
            let v = e.target.value.replace(/\D/g, "").slice(0, 2);
            if (v.length === 1 && +v > 3) v = "0" + v;
            setDd(v); push(mm, v, yyyy);
            if (v.length === 2) yRef.current?.focus();
          }} />
        <span className="text-zinc-300 text-xl">/</span>
        <input ref={yRef} className={cn(box, "w-[36%]")} inputMode="numeric" autoComplete="off" placeholder="YYYY" aria-label="Year" maxLength={4}
          value={yyyy}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYyyy(v); push(mm, dd, v);
          }} />
      </div>
      {bad && <p className="mt-1.5 text-sm text-red-600">That doesn&apos;t look like a real date. Month, day, then four-digit year.</p>}
    </div>
  );
}
