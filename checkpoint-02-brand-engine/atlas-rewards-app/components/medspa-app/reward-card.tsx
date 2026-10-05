/**
 * RewardTile — CP-193 · the Dermis reward card (photo, points chip, name,
 * footer line). Presentational only; Home wraps it in a link, Rewards in a
 * button. Locked tiles keep the photo but mute it and show a lock.
 */
import { optimizedUrl } from "@/lib/img";
import type { MsReward } from "@/lib/medspa-app/data";
import { IcGift, IcLock } from "./icons";

export function RewardTile({ r, points, wide }: { r: MsReward; points: number; wide?: boolean }) {
  const locked = r.point_cost > points;
  return (
    <div className={`${wide ? "w-full" : "w-[232px] shrink-0"} overflow-hidden rounded-[20px] bg-[var(--ms-panel)] ring-1 ring-[#d8dbdf]`}>
      <div className="relative aspect-[232/168] bg-[var(--ms-chip)]">
        {r.image_url
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={optimizedUrl(r.image_url, 480)} alt="" className={`absolute inset-0 h-full w-full object-cover ${locked ? "opacity-70 saturate-[.55]" : ""}`} />
          : <div className="absolute inset-0 grid place-items-center" style={{ color: "var(--ms-p)", background: "linear-gradient(140deg, color-mix(in srgb, var(--ms-p) 16%, #fff), color-mix(in srgb, var(--ms-p) 32%, #fff))" }}><IcGift className="h-10 w-10" /></div>}
      </div>
      <div className="flex flex-col items-center px-3 pb-3 pt-3.5 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[12px] font-bold uppercase tracking-[0.07em]"
          style={locked ? { background: "var(--ms-chip)", color: "#6f7480" } : { background: "var(--ms-p)", color: "#fff" }}>
          {locked && <IcLock className="h-3.5 w-3.5" strokeWidth={2} />}{r.point_cost.toLocaleString()} points
        </span>
        <div className="mt-2.5 line-clamp-2 min-h-[44px] text-[17px] font-semibold leading-[1.3]" style={{ color: "var(--ms-ink)" }}>{r.name}</div>
      </div>
      <div className="bg-[var(--ms-foot)] px-3 py-2.5 text-center text-[13.5px] leading-snug" style={{ color: "#4b5160" }}>
        <span className="line-clamp-2">{locked ? `${(r.point_cost - points).toLocaleString()} more points to unlock` : r.description || "Ready to redeem"}</span>
      </div>
    </div>
  );
}
