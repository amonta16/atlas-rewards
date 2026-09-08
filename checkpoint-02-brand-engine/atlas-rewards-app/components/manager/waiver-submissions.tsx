"use client";
/**
 * WaiverSubmissions — CP-135
 *
 * Signed-waiver log for a business: search (name / email / phone), filter
 * by waiver and date range, paged table, one click into the printable
 * signed record. Rendered on the manager dashboard's Waivers tab (staff +
 * manager) and inside the builder's WaiversManager (agency).
 *
 * Data comes from list_waiver_submissions (SECURITY DEFINER, gated on
 * staffs_business), so nothing here can cross a tenant boundary.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileSignature, ChevronLeft, ChevronRight, ExternalLink, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

type Row = {
  id: string; signed_at: string; signer_name: string | null; signer_email: string | null;
  member_name: string | null; member_phone: string | null; membership_id: string | null;
  waiver_id: string; waiver_title: string; version_id: string; version_no: number;
  campaign_id: string | null; campaign_title: string | null; has_signature: boolean; total_count: number;
};

const PAGE = 25;

export function WaiverSubmissions({
  business, waivers,
}: {
  business: Business;
  waivers: { id: string; title: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [waiverId, setWaiverId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(0); }, [debounced, waiverId, from, to]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      const { data, error } = await supabase.rpc("list_waiver_submissions", {
        p_business_id: business.id,
        p_q: debounced || null,
        p_waiver_id: waiverId || null,
        p_from: from ? new Date(from + "T00:00:00").toISOString() : null,
        // Inclusive end-of-day for the "to" date.
        p_to: to ? new Date(to + "T23:59:59.999").toISOString() : null,
        p_limit: PAGE,
        p_offset: page * PAGE,
      });
      if (cancelled) return;
      if (error) { setErr(error.message); setRows([]); setTotal(0); }
      else {
        const list = (data ?? []) as Row[];
        setRows(list);
        setTotal(Number(list[0]?.total_count ?? 0));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, business.id, debounced, waiverId, from, to, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const primary = business.brand_colors?.primary ?? "#111827";

  return (
    <div className="rounded-2xl border bg-white">
      <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <FileSignature className="h-4 w-4" style={{ color: primary }} />
          <div>
            <div className="text-sm font-bold">Signed waivers</div>
            <div className="text-[11px] text-muted-foreground">{total} record{total === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email or phone" className="h-9 pl-8 w-52 text-sm" />
        </div>
        <select value={waiverId} onChange={e => setWaiverId(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
          <option value="">All waivers</option>
          {waivers.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36 text-sm" />
          <span>–</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36 text-sm" />
        </div>
      </div>

      {err && <div className="px-5 py-3 text-xs text-red-600">{err}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-zinc-50">
            <tr>
              <th className="text-left px-5 py-2 font-semibold">Signed</th>
              <th className="text-left px-3 py-2 font-semibold">Signer</th>
              <th className="text-left px-3 py-2 font-semibold">Member</th>
              <th className="text-left px-3 py-2 font-semibold">Waiver</th>
              <th className="text-left px-3 py-2 font-semibold">Campaign</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-xs">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-xs">
                No signed waivers{debounced || waiverId || from || to ? " match these filters" : " yet"}.
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-zinc-50/60">
                <td className="px-5 py-2.5 whitespace-nowrap">
                  {new Date(r.signed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  <div className="text-[11px] text-muted-foreground">{new Date(r.signed_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold flex items-center gap-1.5">
                    {r.signer_name ?? "—"}
                    {r.has_signature && <PenLine className="h-3 w-3 text-muted-foreground" aria-label="Drawn signature" />}
                  </div>
                  {r.signer_email && <div className="text-[11px] text-muted-foreground">{r.signer_email}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div>{r.member_name ?? "—"}</div>
                  {r.member_phone && <div className="text-[11px] text-muted-foreground">{r.member_phone}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div>{r.waiver_title}</div>
                  <div className="text-[11px] text-muted-foreground">v{r.version_no}</div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.campaign_title ?? "—"}</td>
                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                  <Link href={`/${business.slug}/manage/waiver/${r.id}`} target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: primary }}>
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="px-5 py-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
