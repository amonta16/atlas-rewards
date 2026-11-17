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
 *
 * Phase 3, same watcher:
 *   - Toasts (data-glide-pop="toast") grow from the action that caused them,
 *     or rise from the bottom edge, and leave down to the edge.
 *   - Lists (data-glide-list): a new item fades up into place, a removed one
 *     fades out where it was, and the rest slide to their new places (FLIP).
 *   - Skeletons (animate-pulse) cross-fade into the content that replaces them.
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

  const toast = panel.dataset.glidePop === "toast";
  if (pageGlide() || (!entry.triggerBox && !toast && !calm())) return; // keep its own CSS entrance
  // Take over from the CSS entrance on the panel (the scrim keeps its fade).
  for (const a of panel.getAnimations()) if ("animationName" in a) a.cancel();
  const at = boxOf(panel);
  entry.panelBox = at;
  if (calm()) { panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" }); return; }
  // A toast with no action behind it rises from the bottom edge.
  const from = entry.triggerBox ? toward(panel, at, entry.triggerBox) : { translate: `0px ${window.innerHeight - at.top}px`, scale: "1" };
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
  if (gPanel !== ghost) runs.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], opts(calm() ? 150 : 240)));
  const target = entry.trigger?.isConnected ? boxOf(entry.trigger) : entry.triggerBox;
  if (panel.dataset.glidePop === "toast" && !calm()) {
    // A toast leaves the way it reads: down, off the bottom edge.
    runs.push(gPanel.animate([{ translate: "0px 0px" }, { translate: `0px ${window.innerHeight - rootBox.top}px` }], { duration: 280, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" }));
    runs.push(gPanel.animate([{ opacity: 1 }, { opacity: 0 }], opts(240, 40)));
  } else if (calm() || !target || target.width === 0) {
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

/* ───────────── lists (phase 3) ───────────── */

type Spot = { x: number; y: number; w: number; h: number };
const lists = new WeakMap<HTMLElement, Map<Element, Spot>>();
let listRO: ResizeObserver | null = null;

/** Where `ch` sits inside `list`, ignoring transforms (so a running animation doesn't skew it). */
function spot(list: HTMLElement, ch: HTMLElement): Spot {
  const inside = ch.offsetParent === list;
  return { x: ch.offsetLeft - (inside ? 0 : list.offsetLeft), y: ch.offsetTop - (inside ? 0 : list.offsetTop), w: ch.offsetWidth, h: ch.offsetHeight };
}
function snapList(list: HTMLElement) {
  const m = new Map<Element, Spot>();
  for (const ch of Array.from(list.children)) if (ch instanceof HTMLElement) m.set(ch, spot(list, ch));
  lists.set(list, m);
}
function trackLists(root: HTMLElement) {
  const found = root.matches("[data-glide-list]") ? [root] : [];
  found.push(...Array.from(root.querySelectorAll<HTMLElement>("[data-glide-list]")));
  for (const l of found) { snapList(l); listRO?.observe(l); }
}

function animateList(list: HTMLElement, recs: MutationRecord[]) {
  const before = lists.get(list);
  const removed = new Set<Element>(), added = new Set<Element>();
  for (const r of recs) {
    r.removedNodes.forEach((n) => { if (n instanceof HTMLElement) removed.add(n); });
    r.addedNodes.forEach((n) => { if (n instanceof HTMLElement) added.add(n); });
  }
  for (const n of Array.from(added)) {
    if (!removed.has(n)) continue;
    // Moved, not new. Re-inserting a node restarts its CSS entrance (e.g. animate-rise):
    // cancel that so a reorder reads as a slide, not a flash.
    removed.delete(n); added.delete(n);
    for (const a of n.getAnimations()) if ("animationName" in a) a.cancel();
  }
  if (!before || pageGlide() || list.children.length > 60 || removed.size + added.size > 24) { snapList(list); return; }
  const quiet = calm();
  const lr = list.getBoundingClientRect();
  const cs = getComputedStyle(list);
  // Gone: a copy fades out where it stood (table rows can't stand alone, they just go).
  for (const n of Array.from(removed)) {
    const b = before.get(n);
    if (!b || n.tagName === "TR" || !b.w) continue;
    const ghost = n.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: "fixed", left: `${lr.left + b.x - list.scrollLeft}px`, top: `${lr.top + b.y - list.scrollTop}px`, width: `${b.w}px`, height: `${b.h}px`,
      margin: "0", zIndex: "30", pointerEvents: "none", animation: "none", fontFamily: cs.fontFamily,
    });
    for (const k of ["--p", "--p-rgb"]) { const v = cs.getPropertyValue(k); if (v) ghost.style.setProperty(k, v); }
    ghost.setAttribute("data-glide-ghost", "");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    document.body.appendChild(ghost);
    const a = ghost.animate(quiet ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.96" }], { duration: quiet ? 150 : 220, easing: "ease-out", fill: "forwards" });
    const done = () => ghost.remove();
    a.finished.then(done, done);
    setTimeout(done, 600);
  }
  // New: fades up into its place (unless it brings its own entrance).
  for (const n of Array.from(added)) {
    if (!(n instanceof HTMLElement) || !n.isConnected || n.getAnimations().some((a) => "animationName" in a)) continue;
    n.animate(quiet ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: "0px 8px" }, { opacity: 1, translate: "0px 0px" }], { duration: quiet ? 150 : 260, easing: EASE });
  }
  // Everyone else slides from where they were to where they are now.
  if (!quiet) {
    for (const ch of Array.from(list.children)) {
      if (!(ch instanceof HTMLElement) || added.has(ch)) continue;
      const b = before.get(ch);
      if (!b) continue;
      const now = spot(list, ch);
      const dx = b.x - now.x, dy = b.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      ch.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], { duration: 300, easing: EASE });
    }
  }
  snapList(list);
}

/* ───────────── skeletons (phase 3) ───────────── */

const SKEL = ".animate-pulse";
const skels = new Map<HTMLElement, Box>(); // page coordinates
const pageBox = (el: Element): Box => { const b = boxOf(el); return { ...b, left: b.left + window.scrollX, top: b.top + window.scrollY }; };
function trackSkeletons(root: HTMLElement) {
  if (root.matches(SKEL)) skels.set(root, pageBox(root));
  root.querySelectorAll<HTMLElement>(SKEL).forEach((el) => skels.set(el, pageBox(el)));
}
/** The placeholder fades out where it stood while its content fades in under it. */
function fadeSkeleton(el: HTMLElement, b: Box) {
  if (!b.width || !b.height) return;
  const ghost = el.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: "fixed", left: `${b.left - window.scrollX}px`, top: `${b.top - window.scrollY}px`, width: `${b.width}px`, height: `${b.height}px`,
    margin: "0", zIndex: "30", pointerEvents: "none",
  });
  ghost.setAttribute("data-glide-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  const a = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: calm() ? 150 : 260, easing: "ease-out", fill: "forwards" });
  const done = () => ghost.remove();
  a.finished.then(done, done);
  setTimeout(done, 700);
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
    const touched = new Map<HTMLElement, MutationRecord[]>();
    const unveiled = new Set<Node>(); // parents whose skeleton just left
    for (const r of records) {
      if (r.target instanceof HTMLElement && r.target.hasAttribute("data-glide-list")) touched.set(r.target, [...(touched.get(r.target) ?? []), r]);
      r.removedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || n.hasAttribute("data-glide-ghost")) return;
        for (const e of Array.from(live.values())) {
          if (n === e.root || n === e.panel) { forget(e); exit(e); }
          // Removed with a whole screen (navigation): no exit of its own.
          else if (n.contains(e.panel)) forget(e);
        }
        for (const [el, b] of Array.from(skels)) {
          if (n !== el && !n.contains(el)) continue;
          skels.delete(el);
          if (!pageGlide()) { fadeSkeleton(el, b); unveiled.add(r.target); }
        }
      });
      r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || n.hasAttribute("data-glide-ghost")) return;
        if (n.matches(SEL)) enter(n);
        n.querySelectorAll<HTMLElement>(SEL).forEach(enter);
        trackLists(n);
        trackSkeletons(n);
      });
    }
    // Content that took a skeleton's place fades in under the fading skeleton.
    for (const r of records) {
      if (!unveiled.has(r.target)) continue;
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement && !n.matches(SEL) && !n.matches(SKEL)) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: calm() ? 150 : 260, easing: "ease-out" });
      });
    }
    touched.forEach((recs, list) => animateList(list, recs));
    // Things shift as content loads: keep the skeletons' last places current.
    for (const [el] of Array.from(skels)) { if (el.isConnected) skels.set(el, pageBox(el)); else skels.delete(el); }
  });
  listRO = new ResizeObserver((entries) => entries.forEach((e) => e.target instanceof HTMLElement && e.target.isConnected && snapList(e.target)));
  trackLists(document.body);
  trackSkeletons(document.body);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    started = false;
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", onScroll, true);
    mo.disconnect();
    listRO?.disconnect();
    listRO = null;
  };
}

/** Mounted once in the root layout. */
export function GlideOverlays() {
  useEffect(() => start(), []);
  return null;
}
