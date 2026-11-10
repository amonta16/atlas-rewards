/**
 * Lead-magnet audit, step 7 · the render-to-book panel at the top of Admin → Lead funnel.
 *
 * Render-to-book = previews whose owner clicked Book ÷ previews whose app was on screen, for apps
 * first shown in the range. Under 3% (with at least 20 renders) the panel turns red: that's a
 * product problem (the app, the build, the money screen), not a copy problem. Then the ten events as
 * a funnel, each as a share of renders, and where the Book clicks came from.
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PreviewEvent, RenderToBook } from "@/lib/preview/events";

export type EventsData = {
  missing: boolean;
  counts: Record<PreviewEvent, number>;
  rtb: RenderToBook;
  bookSrc: Array<{ src: string; n: number }>;
  order: Array<{ id: PreviewEvent; label: string }>;
  redLine: number; minRenders: number;
};

const SRC: Record<string, string> = { page: "App page bar", desk: "Front desk", desk_bar: "Desk \"Turn on the engine\" bar", email: "Emails", sms: "Texts", call: "Call scripts", other: "Other links" };
const pct = (n: number | null) => (n == null ? "—" : `${(Math.round(n * 1000) / 10).toLocaleString("en-US")}%`);

export function RenderToBookPanel({ d }: { d: EventsData }) {
  if (d.missing) {
    return <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Lead-magnet events aren&apos;t being recorded yet (CP-244).</p>;
  }
  const r = d.rtb;
  const tone = r.state === "red" ? "border-red-300 bg-red-50" : r.state === "ok" ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white";
  const renders = d.counts.app_rendered || 0;
  const max = Math.max(1, ...d.order.map((e) => d.counts[e.id] ?? 0));
  return (
    <section className={`rounded-xl border p-5 ${tone}`} aria-labelledby="rtb-h">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="rtb-h" className="text-sm font-semibold text-slate-900">Render-to-book</h2>
          <p className="mt-0.5 text-xs text-slate-600">Owners who clicked Book ÷ owners who saw their app, for apps first shown in this range.</p>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-semibold tabular-nums tracking-tight ${r.state === "red" ? "text-red-700" : "text-slate-900"}`}>{pct(r.rate)}</p>
          <p className="text-xs text-slate-600">{r.booked.toLocaleString("en-US")} of {r.renders.toLocaleString("en-US")} renders</p>
        </div>
      </div>
      {r.state === "red" && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Under {pct(d.redLine)}. This is the product, not the copy: check the build (logo, menu, photos), the app page and the time to first paint before touching words.
        </p>
      )}
      {r.state === "ok" && <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />At or above {pct(d.redLine)}.</p>}
      {r.state === "too_few" && <p className="mt-3 text-sm text-slate-600">Fewer than {d.minRenders} renders in this range: too few to judge yet.</p>}

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_280px]">
        <ol className="space-y-1.5" aria-label="Lead-magnet events">
          {d.order.map((e) => {
            const n = d.counts[e.id] ?? 0;
            return (
              <li key={e.id} className="grid grid-cols-[180px_1fr_120px] items-center gap-3 text-sm" title={`${e.label}: ${n} previews`}>
                <span className="truncate text-slate-700">{e.label}</span>
                <span className="h-5 rounded bg-white/70 ring-1 ring-slate-200/70"><span className={`block h-full rounded-r ${e.id === "book_clicked" ? "bg-emerald-600" : e.id === "app_rendered" ? "bg-sky-700" : "bg-sky-500"}`} style={{ width: `${n ? Math.max(1.5, (n / max) * 100) : 0}%` }} /></span>
                <span className="text-right tabular-nums"><b className="text-slate-900">{n.toLocaleString("en-US")}</b>{e.id !== "build_started" && e.id !== "app_rendered" && <span className="ml-1.5 text-xs text-slate-500">{renders ? pct(n / renders) : "—"}</span>}</span>
              </li>
            );
          })}
          <li className="pt-1 text-xs text-slate-500">Previews that did each thing at least once. The small % is of renders.</li>
        </ol>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Where Book clicks came from</h3>
          {d.bookSrc.length === 0 ? <p className="mt-2 text-sm text-slate-500">None yet.</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {d.bookSrc.map((s) => <li key={s.src} className="flex justify-between gap-3"><span className="text-slate-700">{SRC[s.src] ?? s.src}</span><b className="tabular-nums text-slate-900">{s.n}</b></li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
