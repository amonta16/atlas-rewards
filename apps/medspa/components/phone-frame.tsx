"use client";
/**
 * PhoneFrame — CP-233 · the preview app inside a true-to-scale iPhone.
 *
 * The app always renders at a real phone size (390 × 844 CSS px, iPhone 14/15),
 * so its layout is exactly what a patient sees. The whole phone is then scaled
 * down evenly to fit the column and the window height: never stretched or
 * squished. Status bar, Dynamic Island, side buttons and home indicator are
 * drawn around it.
 */
import { useEffect, useRef, useState } from "react";

const SCREEN_W = 390;
const SCREEN_H = 844;
const BEZEL = 14;
const PHONE_W = SCREEN_W + BEZEL * 2;
const PHONE_H = SCREEN_H + BEZEL * 2;
const STATUS_H = 50;
/** White strip under the app for the home indicator, like a real iPhone's bottom safe area. */
const HOME_H = 22;

function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-[50px] items-center justify-between bg-white px-[34px] pt-[6px] text-[16px] font-semibold text-black">
      <span className="tabular-nums tracking-[-0.01em]">9:41</span>
      <span className="flex items-center gap-[6px]" aria-hidden>
        <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#000" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#000" /><rect x="10" y="3" width="3" height="9" rx="1" fill="#000" /><rect x="15" y="0" width="3" height="12" rx="1" fill="#000" /></svg>
        <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.1-1.2A10.2 10.2 0 0 0 8 1C5.3 1 2.8 2 .9 3.8L2 5c1.6-1.5 3.7-2.4 6-2.4Zm0 3.3c1.4 0 2.7.5 3.7 1.4l1.1-1.2A7 7 0 0 0 8 4.3 7 7 0 0 0 3.2 6.1l1.1 1.2c1-.9 2.3-1.4 3.7-1.4Zm0 3.3c.5 0 1 .2 1.4.5L8 11.2 6.6 9.7c.4-.3.9-.5 1.4-.5Z" fill="#000" /></svg>
        <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="#000" strokeOpacity=".4" /><rect x="2" y="2" width="19" height="9" rx="2" fill="#000" /><path d="M24.5 4.5v4a2 2 0 0 0 0-4Z" fill="#000" fillOpacity=".45" /></svg>
      </span>
    </div>
  );
}

/** Same-origin app: hide the desktop scrollbar inside the phone (phones don't show one). */
function hideScrollbars(e: React.SyntheticEvent<HTMLIFrameElement>) {
  try {
    const doc = e.currentTarget.contentDocument;
    if (!doc || doc.getElementById("pf-noscroll")) return;
    const st = doc.createElement("style");
    st.id = "pf-noscroll";
    st.textContent = "html,body{scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{width:0;height:0;display:none}";
    doc.head.appendChild(st);
  } catch {
    /* cross-origin: leave it */
  }
}

export function PhoneFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const byWidth = el.clientWidth / PHONE_W;
      const byHeight = (window.innerHeight - 120) / PHONE_H;
      setScale(Math.max(0.5, Math.min(1, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  const s = scale ?? 0.8;
  return (
    <div ref={box} className="flex w-full justify-center">
      <div style={{ width: PHONE_W * s, height: PHONE_H * s, visibility: scale === null ? "hidden" : "visible" }}>
        <div
          className="relative origin-top-left"
          style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${s})` }}
        >
          {/* side buttons */}
          <span aria-hidden className="absolute -left-[3px] top-[118px] h-[32px] w-[3px] rounded-l bg-[#2a2a2c]" />
          <span aria-hidden className="absolute -left-[3px] top-[178px] h-[62px] w-[3px] rounded-l bg-[#2a2a2c]" />
          <span aria-hidden className="absolute -left-[3px] top-[252px] h-[62px] w-[3px] rounded-l bg-[#2a2a2c]" />
          <span aria-hidden className="absolute -right-[3px] top-[210px] h-[96px] w-[3px] rounded-r bg-[#2a2a2c]" />
          {/* body */}
          <div className="absolute inset-0 rounded-[68px] bg-[#1b1b1d] shadow-[0_50px_90px_-35px_rgba(23,27,38,.6),inset_0_0_0_2px_#3a3a3d,inset_0_0_0_5px_#0c0c0d]" />
          {/* screen */}
          <div className="absolute overflow-hidden rounded-[55px] bg-white" style={{ left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H }}>
            <StatusBar />
            <div aria-hidden className="absolute left-1/2 top-[11px] z-30 h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" />
            <iframe
              src={src}
              title={title}
              className="absolute left-0 block border-0 bg-white"
              style={{ top: STATUS_H, width: SCREEN_W, height: SCREEN_H - STATUS_H - HOME_H }}
              loading="eager"
              onLoad={hideScrollbars}
            />
            <div aria-hidden className="pointer-events-none absolute bottom-[8px] left-1/2 z-30 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black/85" />
          </div>
        </div>
      </div>
    </div>
  );
}
