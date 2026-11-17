"use client";
/**
 * Glide, phase 2 (CP-248): menus start at their button.
 *
 * Every dialog (role="dialog": sheets, modals, the cart, the desk Modal) and
 * every opt-in popover (data-glide-pop) grows out of the button that opened
 * it, and on close shrinks back into that button. One watcher does it for the
 * whole app, so no overlay needs its own animation code:
 *
 *   - A capture-phase click listener remembers the last tapped control.
 *   - A MutationObserver sees an overlay arrive, takes over from its CSS
 *     entrance (animate-sheet / animate-rise) and plays a grow from that
 *     control (translate + scale + opacity only).
 *   - When React removes an overlay, a short-lived inert copy of it
 *     plays the reverse into the control, then is removed.
 *
 * An overlay that opened with no tap behind it (a timer, a poll) keeps its
 * CSS entrance and gets a plain fade on close. Reduced motion: fades only.
 * While a page glide (view transition) runs, the view transition owns the
 * motion and this stays out of the way.
 */
import { useEffect } from "react";

type Box = { left: number; top: number; width: number; height: number };
type Entry = {
  root: HTMLElement; panel: HTMLElement;
  rootBox: Box; panelBox: Box; panelScroll: number;
  trigger: Element | null; triggerBox: Box | null;
  vars: Record<string, string>;
  ro: ResizeObserver; onScroll: () => void;
};

const SEL = '[role="dialog"], [data-glide-pop]';
const EASE = "cubic-bezier(.2,.8,.2,1)";
const TRIGGER = 'button, a, [role="button"], summary, label, [data-glide-trigger]';
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pageGlide = () => !!document.documentElement.dataset.glide;
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };

let last: { el: Element; box: Box; at: number } | null = null;
const live = new Map<HTMLElement, Entry>();

/** The overlay's outermost fixed layer (its scrim), or the panel itself for an in-page popover. */
function rootOf(panel: HTMLElement) {
  for (let el: HTMLElement | null = panel; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).position === "fixed") return el;
  }
  return panel;
}

/** translate + scale that put `panel` (at `at`) over `target`, keeping its proportions. */
function toward(panel: HTMLElement, at: Box, target: Box) {
  const s = Math.min(0.95, Math.max(0.12, Math.max(target.width / at.width, target.height / at.height)));
  // An existing transform on the panel (e.g. -translate-x-1/2) is scaled too; correct for it.
  const t = getComputedStyle(panel).transform;
  const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : null;
  const bx = m?.e ?? 0, by = m?.f ?? 0;
  const dx = target.left + target.width / 2 - (at.left + at.width / 2) + bx * (1 - s);
  const dy = target.top + target.height / 2 - (at.top + at.height / 2) + by * (1 - s);
  return { translate: `${dx}px ${dy}px`, scale: `${s}` };
}

function enter(panel: HTMLElement) {
  // Skip our own close copies (they are dialogs too) and anything already tracked.
  if (live.has(panel) || !panel.isConnected || panel.closest("[data-glide-ghost]")) return;
  const root = rootOf(panel);
  const fresh = last && performance.now() - last.at < 2500 && !root.contains(last.el) ? last : null;
  const cs = getComputedStyle(root);
  const entry: Entry = {
    root, panel, rootBox: boxOf(root), panelBox: boxOf(panel), panelScroll: panel.scrollTop,
    trigger: fresh?.el ?? null,
    triggerBox: fresh ? (fresh.el.isConnected ? boxOf(fresh.el) : fresh.box) : null,
    // The copy played on close lives in <body>: carry the clinic's brand color and font.
    vars: { "--p": cs.getPropertyValue("--p"), "--p-rgb": cs.getPropertyValue("--p-rgb"), "font-family": cs.fontFamily },
    ro: new ResizeObserver(() => { entry.rootBox = boxOf(root); entry.panelBox = boxOf(panel); }),
    onScroll: () => { entry.panelScroll = panel.scrollTop; },
  };
  entry.ro.observe(root);
  if (root !== panel) entry.ro.observe(panel);
  panel.addEventListener("scroll", entry.onScroll, { passive: true });
  live.set(panel, entry);

  if (pageGlide() || (!entry.triggerBox && !calm())) return; // keep its own CSS entrance
  // Take over from the CSS entrance on the panel (the scrim keeps its fade).
  for (const a of panel.getAnimations()) if ("animationName" in a) a.cancel();
  const at = boxOf(panel);
  entry.panelBox = at;
  if (calm()) { panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" }); return; }
  const from = toward(panel, at, entry.triggerBox!);
  panel.animate([from, { translate: "0px 0px", scale: "1" }], { duration: 320, easing: EASE });
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: "ease-out" });
}

function exit(entry: Entry) {
  const { root, panel, rootBox } = entry;
  if (pageGlide() || rootBox.width === 0) return;
  const ghost = root.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: "fixed", left: `${rootBox.left}px`, top: `${rootBox.top}px`, width: `${rootBox.width}px`, height: `${rootBox.height}px`,
    right: "auto", bottom: "auto", margin: "0", transform: "none", translate: "none", scale: "none", animation: "none", pointerEvents: "none",
  });
  for (const [k, v] of Object.entries(entry.vars)) if (v) ghost.style.setProperty(k, v);
  ghost.setAttribute("data-glide-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.removeAttribute("id");
  ghost.querySelectorAll<HTMLElement>('[class*="animate-"], [id]').forEach((el) => { el.style.animation = "none"; el.removeAttribute("id"); });
  document.body.appendChild(ghost);
  const gPanel = root === panel ? ghost : ghost.querySelector<HTMLElement>(SEL) ?? ghost;
  gPanel.scrollTop = entry.panelScroll;

  const runs: Animation[] = [];
  const opts = (duration: number, delay = 0): KeyframeAnimationOptions => ({ duration, delay, easing: "ease-out", fill: "forwards" });
  if (gPanel !== ghost) runs.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], opts(240)));
  const target = entry.trigger?.isConnected ? boxOf(entry.trigger) : entry.triggerBox;
  if (calm() || !target || target.width === 0) {
    runs.push(gPanel.animate([{ opacity: 1 }, { opacity: 0 }], opts(calm() ? 150 : 180)));
  } else {
    const to = toward(gPanel, boxOf(gPanel), target);
    runs.push(gPanel.animate([{ translate: "0px 0px", scale: "1" }, to], { duration: 260, easing: EASE, fill: "forwards" }));
    runs.push(gPanel.animate([{ opacity: 1 }, { opacity: 0 }], opts(190, 70)));
  }
  const done = () => ghost.remove();
  Promise.all(runs.map((a) => a.finished)).then(done, done);
  setTimeout(done, 800);
}

function forget(entry: Entry) {
  entry.ro.disconnect();
  entry.panel.removeEventListener("scroll", entry.onScroll);
  live.delete(entry.panel);
}

let started = false;
function start() {
  if (started) return () => {};
  started = true;
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(TRIGGER);
    if (el) last = { el, box: boxOf(el), at: performance.now() };
  };
  const onScroll = () => { for (const e of live.values()) { e.rootBox = boxOf(e.root); e.panelBox = boxOf(e.panel); } };
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      r.removedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || n.hasAttribute("data-glide-ghost")) return;
        for (const e of Array.from(live.values())) {
          if (n === e.root || n === e.panel) { forget(e); exit(e); }
          // Removed with a whole screen (navigation): no exit of its own.
          else if (n.contains(e.panel)) forget(e);
        }
      });
      r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || n.hasAttribute("data-glide-ghost")) return;
        if (n.matches(SEL)) enter(n);
        n.querySelectorAll<HTMLElement>(SEL).forEach(enter);
      });
    }
  });
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    started = false;
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", onScroll, true);
    mo.disconnect();
  };
}

/** Mounted once in the root layout. */
export function GlideOverlays() {
  useEffect(() => start(), []);
  return null;
}
