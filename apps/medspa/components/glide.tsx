"use client";
/**
 * Glide (CP-248): nothing just appears. A tapped card becomes the page it
 * opens, and Back (in-app button, browser Back, swipe-back) runs the same
 * motion in reverse into the card, at its old scroll position.
 *
 * Built on the browser's View Transitions API, no motion library:
 *   - A card is any element with data-glide-key="t:<id>" (t treatment,
 *     i shop item, m membership, r reward, p patient). Inside it,
 *     data-glide="media" / "title" / "avatar" mark the parts that travel.
 *   - The page or panel it opens carries data-glide-hero="<same key>" with
 *     the same data-glide parts.
 *   - Names are set only for the moment of a transition (never in the
 *     markup), so every name is unique and nothing is captured by accident.
 *
 * Browsers without View Transitions keep today's instant behaviour. With
 * prefers-reduced-motion nothing travels; the page just cross-fades.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, type ComponentProps } from "react";

export type GlideDir = "forward" | "back";
type Target = Element | null | undefined | (() => Element | null | undefined);
type Router = ReturnType<typeof useRouter>;
type VT = { finished: Promise<void>; skipTransition(): void };

const supported = () => typeof document !== "undefined" && "startViewTransition" in document;
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const here = () => window.location.pathname + window.location.search;
const resolve = (t: Target) => (typeof t === "function" ? t() : t);

/* ───────────── naming the parts that travel ───────────── */

let named: HTMLElement[] = [];
function clearNames() {
  for (const el of named) el.style.removeProperty("view-transition-name");
  named = [];
}
function onScreen(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}
/** Gives `root` (if it is a part) and its data-glide parts their transition names. */
function nameParts(root: Element | null | undefined) {
  if (!root || calm()) return;
  const seen = new Set<string>();
  for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("[data-glide]"))] as HTMLElement[]) {
    const part = el.dataset?.glide;
    if (!part || seen.has(part) || !onScreen(el)) continue;
    seen.add(part);
    el.style.setProperty("view-transition-name", `glide-${part}`);
    named.push(el);
  }
}
const sel = (attr: string, key: string) => `[${attr}="${CSS.escape(key)}"]`;
export const heroFor = (key: string) => document.querySelector(sel("data-glide-hero", key));
export const cardFor = (key: string, n = 0) => document.querySelectorAll(sel("data-glide-key", key))[n] ?? null;

/* ───────────── where the user came from (per page) ───────────── */

type Spot = { key: string; n: number };
const spots = new Map<string, Spot>();
const scrolls = new Map<string, number>();
function load() {
  try {
    for (const [k, v] of Object.entries(JSON.parse(sessionStorage.getItem("glide:spots") ?? "{}") as Record<string, Spot>)) spots.set(k, v);
    for (const [k, v] of Object.entries(JSON.parse(sessionStorage.getItem("glide:scroll") ?? "{}") as Record<string, number>)) scrolls.set(k, v);
  } catch { /* private window: back still works, just without the morph after a reload */ }
}
function save() {
  try {
    sessionStorage.setItem("glide:spots", JSON.stringify(Object.fromEntries(Array.from(spots).slice(-40))));
    sessionStorage.setItem("glide:scroll", JSON.stringify(Object.fromEntries(Array.from(scrolls).slice(-40))));
  } catch { /* fine */ }
}
/** Remembers which card on this page was tapped, so Back can land on it. */
function remember(card: Element) {
  const key = card.getAttribute("data-glide-key");
  if (!key) return;
  const n = Array.from(document.querySelectorAll(sel("data-glide-key", key))).indexOf(card);
  spots.set(here(), { key, n: Math.max(0, n) });
  save();
}

/* ───────────── the transition ───────────── */

let commit: (() => void) | null = null;
let current: VT | null = null;
let cardNav = false;

/**
 * Runs `update` inside a view transition: `from` parts are captured in the
 * old state, `to` parts in the new one. With `waitForUrl` the new state is
 * captured once Next has rendered the new URL (GlideRoot signals it).
 */
export function glide({ dir, from, update, to, waitForUrl }: { dir: GlideDir; from?: Target; update: () => void; to?: Target; waitForUrl?: boolean }) {
  if (!supported()) { update(); return; }
  const html = document.documentElement;
  clearNames();
  nameParts(resolve(from));
  html.dataset.glide = dir;
  let began = false;
  const vt = (document as unknown as { startViewTransition(cb: () => Promise<void>): VT }).startViewTransition(async () => {
    began = true;
    clearNames();
    if (waitForUrl) {
      await new Promise<void>((done) => {
        // A slow page must never freeze the screen: give up on the morph after 2.5 s.
        const t = setTimeout(done, 2500);
        commit = () => { clearTimeout(t); done(); };
        update();
      });
      commit = null;
    } else {
      update();
    }
    nameParts(resolve(to));
  });
  current = vt;
  // A page that isn't painting (backgrounded, throttled) never captures the old
  // frame: skip the motion so the tap still navigates (skipping still runs update).
  setTimeout(() => { if (!began) vt.skipTransition(); }, 1500);
  vt.finished.catch(() => {}).finally(() => {
    if (current !== vt) return;
    clearNames();
    delete html.dataset.glide;
    current = null;
  });
}

/** Navigates with a glide. `from` is the tapped card; with no card, the current page's hero travels back into its card. */
export function glideTo(router: Router, href: string, { dir = "forward", from, replace }: { dir?: GlideDir; from?: Element | null; replace?: boolean } = {}) {
  const go = () => (replace ? router.replace(href) : router.push(href));
  const dest = new URL(href, window.location.href);
  if (!supported() || dest.pathname + dest.search === here()) { go(); return; }
  const hero = document.querySelector("[data-glide-hero]");
  const key = from?.getAttribute("data-glide-key") ?? hero?.getAttribute("data-glide-hero") ?? null;
  if (from) { remember(from); cardNav = true; }
  glide({
    dir, waitForUrl: true, update: go,
    from: from ?? hero,
    to: () => (key ? (dir === "forward" ? heroFor(key) ?? cardFor(key) : cardFor(key)) : null),
  });
}

/** Same as glideTo, for a URL change made with history.pushState (the desk). */
export function glidePush(href: string, { dir = "forward", from, replace }: { dir?: GlideDir; from?: Element | null; replace?: boolean } = {}) {
  const push = () => (replace ? window.history.replaceState(null, "", href) : window.history.pushState(null, "", href));
  if (!supported()) { push(); return; }
  if (dir === "back") {
    // Closing: the open hero folds back into its card, if that card is on screen.
    const key = from?.getAttribute("data-glide-hero") ?? null;
    glide({ dir, waitForUrl: true, update: push, from, to: () => (key ? cardFor(key) : null) });
    return;
  }
  const key = from?.getAttribute("data-glide-key") ?? null;
  if (from) { remember(from); cardNav = true; }
  glide({ dir, waitForUrl: true, update: push, from, to: () => (key ? heroFor(key) : null) });
}

/* ───────────── links and back ───────────── */

/** A next/link that morphs into the page it opens. */
export function GlideLink({ glideKey, onClick, onPointerDown, ...props }: ComponentProps<typeof Link> & { href: string; glideKey: string }) {
  const router = useRouter();
  return (
    <Link
      {...props}
      data-glide-key={glideKey}
      // Start loading on touch-down: the morph begins as soon as the page is ready.
      onPointerDown={(e) => { onPointerDown?.(e); try { router.prefetch(props.href, { kind: "full" } as never); } catch { /* fine */ } }}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !supported()) return;
        e.preventDefault();
        glideTo(router, props.href, { from: e.currentTarget });
      }}
    />
  );
}

let moved = false;
/** True when the previous history entry is a screen of this app (so Back stays in it). */
function canGoBackInApp() {
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number }; entries(): { url: string | null }[] } }).navigation;
  if (nav?.currentEntry) {
    const prev = nav.entries()[nav.currentEntry.index - 1];
    if (!prev?.url) return false;
    const slug = window.location.pathname.split("/")[1];
    return new URL(prev.url).pathname.split("/")[1] === slug;
  }
  return moved;
}

/** The detail screens' Back: history back when it stays in the app, else the fallback screen, both gliding back into the card. */
export function useGlideBack(fallback: string) {
  const router = useRouter();
  return () => (canGoBackInApp() ? router.back() : glideTo(router, fallback, { dir: "back" }));
}

/* ───────────── the root: commits, browser back, scroll ───────────── */

function Watcher() {
  const path = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  useLayoutEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const href = here();
    if (lastHref !== null && lastHref !== href) {
      moved = true;
      if (popTarget !== null) window.scrollTo(0, popTarget);
      // Left a page some other way than its cards: its spot no longer applies.
      else if (!cardNav && spots.delete(lastHref)) save();
    }
    popTarget = null;
    cardNav = false;
    lastHref = href;
    commit?.();
  }, [path, search]);
  return null;
}

let lastHref: string | null = null;
let popTarget: number | null = null;

export function GlideRoot() {
  useEffect(() => {
    load();
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; scrolls.set(here(), window.scrollY); });
    };
    let replaying = false;
    const onPop = (e: PopStateEvent) => {
      if (replaying) return;
      const dest = here();
      const src = lastHref;
      if (dest === src) return; // a #hash change on the same screen
      popTarget = scrolls.get(dest) ?? 0;
      // iOS swipe-back already animated the page: don't animate it twice.
      if (!supported() || (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition || !(e.state as { __NA?: boolean } | null)?.__NA) return;
      e.stopImmediatePropagation();
      const back = spots.get(dest);
      const fwd = src ? spots.get(src) : undefined;
      const replay = () => {
        replaying = true;
        window.dispatchEvent(new PopStateEvent("popstate", { state: e.state }));
        replaying = false;
      };
      if (back) {
        glide({ dir: "back", waitForUrl: true, update: replay, from: heroFor(back.key) ?? cardFor(back.key), to: () => cardFor(back.key, back.n) });
      } else if (fwd) {
        glide({ dir: "forward", waitForUrl: true, update: replay, from: cardFor(fwd.key, fwd.n), to: () => heroFor(fwd.key) ?? cardFor(fwd.key) });
      } else {
        glide({ dir: "back", waitForUrl: true, update: replay });
      }
    };
    const onHide = () => save();
    window.addEventListener("scroll", onScroll, { passive: true });
    // Capture phase: runs before Next's own popstate handler, which it then replays.
    window.addEventListener("popstate", onPop, true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop, true);
      window.removeEventListener("pagehide", onHide);
      window.history.scrollRestoration = prev;
      commit?.(); // leaving the clinic screens mid-transition: let it finish
    };
  }, []);
  return <Suspense fallback={null}><Watcher /></Suspense>;
}
