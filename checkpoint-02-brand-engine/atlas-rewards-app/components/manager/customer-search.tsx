"use client";
/**
 * CustomerSearch — CP-30
 *
 * Single search bar on the Front desk view. Live results dropdown of the
 * top 5 fuzzy matches by name / phone / email / referral code. Click or
 * Enter on a result opens the existing AwardPointsPanel via the parent's
 * onPick callback.
 *
 * Keyboard:
 *   - ↑ / ↓   move highlighted result
 *   - Enter   pick the highlighted result (or the first one)
 *   - Esc     close the dropdown and clear
 *
 * Debounce is 220ms — fast enough that the dropdown updates as the staff
 * types, slow enough that we're not hammering the DB for every keystroke.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, User, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Hit = {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  referral_code: string | null;
  points_balance: number;
  tier: string;
  joined_at: string;
  visit_count: number;
};

export function CustomerSearch({
  businessId,
  primary,
  onPick,
}: {
  businessId: string;
  primary: string;
  onPick: (member: Hit) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /** Debounced fetch. */
  const run = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient();
      setLoading(true);
      const { data, error } = await supabase.rpc("search_members", {
        p_business_id: businessId,
        p_q: query,
      });
      setLoading(false);
      if (!error) {
        setHits((data ?? []) as Hit[]);
        setHighlight(0);
      }
    }, 220);
  }, [businessId]);

  useEffect(() => {
    if (q.trim().length === 0) {
      setHits(null);
      setOpen(false);
      return;
    }
    setOpen(true);
    run(q);
  }, [q, run]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(h: Hit) {
    setQ("");
    setHits(null);
    setOpen(false);
    onPick(h);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = hits[highlight] ?? hits[0];
      if (target) pick(target);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (hits && hits.length) setOpen(true); }}
          onKeyDown={onKey}
          placeholder="Find a customer by name, phone, email, or code…"
          className="w-full h-11 pl-10 pr-9 rounded-2xl border bg-white text-sm outline-none focus:ring-2 focus:ring-offset-1 transition"
          style={{ borderColor: q ? primary : undefined }}
          aria-label="Search customers"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(""); setHits(null); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-zinc-100 flex items-center justify-center"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-40 rounded-2xl border bg-white shadow-xl overflow-hidden">
          {loading && (
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}

          {!loading && hits && hits.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              No customers match <span className="font-semibold">{q}</span>.
            </div>
          )}

          {!loading && hits && hits.map((h, i) => {
            const phoneTail = h.phone ? h.phone.replace(/\D/g, "").slice(-4) : null;
            return (
              <button
                key={h.membership_id}
                type="button"
                onClick={() => pick(h)}
                onMouseEnter={() => setHighlight(i)}
                className={
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition " +
                  (highlight === i ? "bg-zinc-50" : "hover:bg-zinc-50")
                }
              >
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                >
                  {(h.full_name ?? h.email ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold leading-tight truncate flex items-center gap-2">
                    {h.full_name || h.email || "(no name)"}
                    {h.referral_code && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 tracking-wider">
                        {h.referral_code}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {phoneTail && <>·· {phoneTail}</>}
                    {phoneTail && h.email && " · "}
                    {h.email}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold tabular-nums" style={{ color: primary }}>
                    {h.points_balance.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">pts</div>
                </div>
              </button>
            );
          })}

          {!loading && hits && hits.length > 0 && (
            <div className="px-3 py-1.5 border-t bg-zinc-50/60 text-[10px] text-zinc-400 flex items-center gap-2">
              <User className="h-3 w-3" /> ↑ ↓ to move · Enter to pick · Esc to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}
