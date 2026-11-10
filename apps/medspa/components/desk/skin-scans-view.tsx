"use client";
/**
 * CP-241 · Skin scans: patients who ran the AI skin scan in the app and saved
 * it. Their weakest areas and the treatments it matched them to, so the desk
 * can reach out while they're still thinking about it.
 */
import { useEffect, useState } from "react";
import type { DeskApi, DeskMember, SkinScanRow } from "@/lib/desk-api";
import { concernDef, WEAK_BELOW } from "@/lib/skin-scan";
import { formatPhone } from "@/lib/format";
import { IcChat, IcPhone, IcUser } from "../icons";
import { Empty } from "./ui";

const when = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function SkinScansView({ api, enabled, clinicName, slug, onOpen, onSettings, say }: {
  api: DeskApi; enabled: boolean; clinicName: string; slug: string;
  onOpen: (m: DeskMember) => void; onSettings?: () => void; say: (t: string) => void;
}) {
  const [rows, setRows] = useState<SkinScanRow[] | null>(null);
  useEffect(() => { api.skinScans().then(setRows).catch((e) => { say((e as Error).message); setRows([]); }); }, [api, say]);

  async function openProfile(r: SkinScanRow) {
    if (!r.phone) return;
    const res = await api.lookup(r.phone).catch(() => null);
    if (res?.kind === "members" && res.members[0]) onOpen(res.members[0]);
    else say("No profile found for that phone number.");
  }

  return (
    <div className="space-y-4 pb-10">
      <p className="max-w-[64ch] text-[14.5px] text-sub">
        Patients who scanned their skin in the app and saved it. Their lowest scores and the treatments the scan matched them to: a warm reason to reach out.
      </p>

      {!enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-brand/25 bg-brand/[0.06] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold">The skin scan is off</p>
            <p className="text-[13.5px] text-sub">Turn it on and it shows up in your app under Educate yourself.</p>
          </div>
          {onSettings && <button type="button" onClick={onSettings} className="h-10 rounded-full bg-ink px-5 text-[14px] font-semibold text-white">Turn it on</button>}
        </div>
      )}

      {rows === null ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-[132px] animate-pulse rounded-[24px] bg-white/70" />)}</div>
      ) : rows.length === 0 ? (
        <Empty text={enabled ? "No saved scans yet. They show up here when a patient scans and saves their results." : "No scans yet."} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((r) => {
            const weak = [...r.metrics].sort((a, b) => a.score - b.score).slice(0, 3);
            const first = r.full_name?.split(/\s+/)[0];
            const text = `Hi${first ? ` ${first}` : ""}, it's ${clinicName}. Thanks for doing your skin scan! Want us to walk you through your results and the best place to start?`;
            return (
              <article key={r.id} className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]">
                <div className="flex items-start gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-[14px] font-bold text-brand">{initials(r.full_name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold">{r.full_name ?? "Patient"}</p>
                    <p className="text-[13px] text-sub">{r.phone ? formatPhone(r.phone) : r.email ?? "No contact"} · {when(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[26px] font-semibold leading-none tabular-nums">{r.overall}</p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Skin score</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {weak.map((m) => (
                    <span key={m.id} className={`rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${m.score < 60 ? "bg-[#FDECEA] text-[#A3332A]" : m.score < WEAK_BELOW ? "bg-[#FFF4E0] text-[#8A5A00]" : "bg-page text-sub"}`}>
                      {concernDef(m.id).label} <span className="tabular-nums opacity-75">{m.score}</span>
                    </span>
                  ))}
                  {r.skin_age ? <span className="rounded-full bg-page px-2.5 py-1 text-[12.5px] font-semibold text-sub">Skin age {r.skin_age}</span> : null}
                </div>

                {r.treatments.length > 0 && (
                  <p className="mt-3 text-[13.5px] text-sub">Matched to <span className="font-semibold text-ink">{r.treatments.join(", ")}</span></p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {r.phone && <a href={`sms:${r.phone}?&body=${encodeURIComponent(text)}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-white"><IcChat className="h-4 w-4" />Text</a>}
                  {r.phone && <a href={`tel:${r.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-page px-4 text-[13.5px] font-semibold"><IcPhone className="h-4 w-4" />Call</a>}
                  {r.phone && <button type="button" onClick={() => openProfile(r)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-page px-4 text-[13.5px] font-semibold"><IcUser className="h-4 w-4" />Profile</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="text-[12.5px] text-faint">Scores only. Patient photos are never stored. <a href={`/${slug}/skin-scan`} target="_blank" rel="noreferrer" className="font-semibold text-sub underline-offset-2 hover:underline">Try the scan yourself</a></p>
    </div>
  );
}
