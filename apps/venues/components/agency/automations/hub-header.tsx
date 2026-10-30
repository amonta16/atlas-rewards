"use client";
/**
 * Shared header bits for /agency/automations (CP-217): title, business picker,
 * and the "Med spa suite | Custom workflows" switch.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMockHost } from "@/lib/automations/client";
import type { BusinessOption } from "@/lib/automations/types";

export function HubTitle() {
  return (
    <div className="flex items-center gap-3">
      <h1 className="text-[22px] font-semibold tracking-tight text-[#14213d]">Automations</h1>
      {isMockHost() && <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">Local preview · mock engine</span>}
    </div>
  );
}

export function BusinessPicker({ businesses, business, view }: { businesses: BusinessOption[]; business: BusinessOption; view?: "suite" | "custom" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isMedspa = business.layout_preset === "medspa";
  return (
    <div className="relative mt-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-zinc-600 hover:text-[#14213d]">
        <span className="font-medium text-[#14213d]">{business.name}</span><span className="text-zinc-400">·</span>{isMedspa ? "Med spa" : "Classic"} layout<ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-30 max-h-80 w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
          {businesses.map((b) => (
            <button key={b.id} type="button" onClick={() => { setOpen(false); router.push(`/agency/automations?business=${encodeURIComponent(b.slug)}${view === "custom" ? "&view=custom" : ""}`); }}
              className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-zinc-50", b.id === business.id && "bg-[#eaf1fc]")}>
              <span className="truncate">{b.name}</span><span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">{b.layout_preset === "medspa" ? "med spa" : "classic"}{b.is_demo ? " · demo" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Segmented control; plain links so the choice lives in the URL (?view=custom). */
export function ViewSwitch({ business, view }: { business: BusinessOption; view: "suite" | "custom" }) {
  const base = `/agency/automations?business=${encodeURIComponent(business.slug)}`;
  const item = (v: "suite" | "custom", label: string) => (
    <Link href={v === "custom" ? `${base}&view=custom` : base} scroll={false}
      className={cn("rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors", view === v ? "bg-white text-[#06318F] shadow-[0_1px_3px_rgba(15,23,42,.12)] ring-1 ring-zinc-200" : "text-zinc-600 hover:text-[#14213d]")}>
      {label}
    </Link>
  );
  return <div className="flex items-center gap-0.5 rounded-xl bg-zinc-100 p-1">{item("suite", "Med spa suite")}{item("custom", "Custom workflows")}</div>;
}
