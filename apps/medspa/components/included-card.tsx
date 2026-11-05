"use client";
import Link from "next/link";
import { useState } from "react";
import { optimizedUrl } from "@atlas/core/img";
import type { IncludedTreatment } from "@/lib/plans";
import { IcBag, IcDown, IcNext } from "./icons";

export function IncludedCard({ item, href, image, about }: { item: IncludedTreatment; href: string | null; image: string | null; about: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3.5">
      <div className="flex items-center gap-3.5 px-1">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-page">
          {image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={optimizedUrl(image, 120)} alt="" className="h-full w-full object-cover" />
            : <IcBag className="h-6 w-6 text-ink" />}
        </div>
        <div className="min-w-0">
          <span className="pill-soft">{item.unit.split(" ")[0]}</span>
          <p className="mt-1 text-[14.5px] font-medium leading-tight">{item.name}</p>
          <p className="text-[12.5px] text-sub">{item.quantity} {item.unit}</p>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="mt-2.5 flex w-full items-center justify-between px-1 text-[13px] text-sub">
        Learn more about this treatment
        <IcDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.2} />
      </button>
      {open && (
        <div className="animate-rise px-1 pt-2 text-[13.5px] leading-snug text-sub">
          <p>{item.note || about || "Included with your membership."}</p>
          {href && <Link href={href} className="mt-2.5 inline-flex items-center gap-1 font-semibold text-ink">View treatment <IcNext className="h-3.5 w-3.5" strokeWidth={2.4} /></Link>}
        </div>
      )}
    </div>
  );
}
