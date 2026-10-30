"use client";
/**
 * BirthdayGift — CP-193 · the wrapped box on Home during the birthday week.
 * Only rendered when process_birthdays has actually credited points
 * (getMsBirthdayGift), so unwrapping shows a real number.
 */
import { useState } from "react";

export function BirthdayGift({ firstName, fullName, points, pointsLabel }: { firstName: string; fullName: string; points: number; pointsLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="px-5 pt-9 text-center">
      <h2 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>{firstName}, happy birthday!</h2>
      <p className="mt-1 text-[17px]" style={{ color: "var(--ms-sub)" }}>{open ? "Enjoy, it's already in your balance." : "We got you a little gift."}</p>
      <button type="button" onClick={() => setOpen(true)} aria-label={open ? "Gift opened" : "Unwrap your gift"}
        className="relative mt-7 block aspect-[2/1.2] w-full overflow-hidden rounded-[22px] text-left shadow-[0_18px_40px_-24px_rgba(60,40,20,.55)]"
        style={{ background: open ? "#fff" : "linear-gradient(160deg,#e9bf94,#e2b184)" }}>
        {!open ? (
          <>
            <span className="absolute inset-y-0 left-[46%] w-[9%]" style={{ background: "var(--ms-p)" }} />
            <span className="absolute inset-x-0 top-[52%] h-[13%]" style={{ background: "var(--ms-p)" }} />
            <span className="absolute left-[50.5%] top-[50%] h-[30%] w-[22%] -translate-x-full -translate-y-1/2 -rotate-[24deg] rounded-[50%] border-[7px]" style={{ borderColor: "var(--ms-p)" }} />
            <span className="absolute left-[50.5%] top-[50%] h-[30%] w-[22%] -translate-y-1/2 rotate-[24deg] rounded-[50%] border-[7px]" style={{ borderColor: "var(--ms-p)" }} />
            <span className="absolute left-[50.5%] top-[58%] h-[9%] w-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "color-mix(in srgb, var(--ms-p) 80%, #000)" }} />
            <span className="absolute bottom-[14%] left-[5%] -rotate-[10deg] rounded-md bg-[#fbeef0] px-4 py-2 text-[24px] shadow-sm" style={{ fontFamily: "'Bradley Hand','Segoe Print','Comic Sans MS',cursive", color: "#3a2a2a" }}>{fullName}</span>
            <span className="absolute left-1/2 top-[-2px] -translate-x-1/2 rounded-lg bg-[#262b3d] px-3.5 py-2 text-[14px] font-medium text-white after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-[#262b3d]">Tap to unwrap</span>
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center" style={{ animation: "ms-pop .55s cubic-bezier(.2,.9,.3,1.2) both" }}>
            <div>
              <div className="text-[56px] font-semibold leading-none tracking-[-0.03em]" style={{ color: "var(--ms-p)" }}>+{points.toLocaleString()}</div>
              <div className="mt-2 text-[16px]" style={{ color: "var(--ms-sub)" }}>{pointsLabel} added for your birthday</div>
            </div>
          </div>
        )}
      </button>
    </section>
  );
}
