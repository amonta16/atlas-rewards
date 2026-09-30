"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ImagePlus, Pipette, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dominantColorsFromFile, paletteFromColor } from "@/lib/logo-colors";
import { BRAND_SWATCHES, VENUE_TYPES, type LiveBrand, type VenueTypeId } from "@/lib/landing/live-app-data";
import { track } from "@/lib/landing/analytics";
import { LiveApp } from "./live-app/live-app";
import { BookingCalendar } from "./booking-calendar";

/**
 * Demo booker — CP-176. Owner.com-style: while you book, you build.
 * Venue name + type + color (or drop a logo — colors are pulled from it in
 * the browser, nothing uploads) re-skin a working Atlas app on the left;
 * the calendar on the right carries those choices into the demo request so
 * the rep walks in with the mockup already made.
 */
const INDUSTRY_FOR: Record<VenueTypeId, string> = {
  arcade: "Arcade / family fun center",
  cages: "Batting cages / sports",
  bowling: "Trampoline park / bowling",
  karts: "Go-karts / mini golf",
  golf: "Other",
  trampoline: "Trampoline park / bowling",
};

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export function DemoBooker({ source, firstFieldRef, layout = "modal" }: { source: string; firstFieldRef?: RefObject<HTMLInputElement>; layout?: "modal" | "page" }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<VenueTypeId>("arcade");
  const [color, setColor] = useState(BRAND_SWATCHES[0]);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const touched = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo); }, [logo]);

  const touch = () => {
    if (touched.current) return;
    touched.current = true;
    track("interactive_demo_used", { demo: "brand_your_app", source });
  };

  const venue = VENUE_TYPES.find((v) => v.id === type) ?? VENUE_TYPES[0];
  const brand: LiveBrand = useMemo(() => {
    // Same seed → palette the instant-demo builder uses, but kept in ONE hue
    // family (light highlight + deep accent) so any color the visitor picks
    // looks intentional in the phone.
    const p = paletteFromColor(color);
    return { name: name.trim() || "Your Venue", logoUrl: logo, primary: p.primary, secondary: mix(p.primary, "#ffffff", 0.45), accent: p.secondary, heroUrl: venue.hero };
  }, [name, color, logo, venue.hero]);

  async function onLogo(f: File | undefined) {
    if (!f) return;
    touch();
    if (logo) URL.revokeObjectURL(logo);
    setLogo(URL.createObjectURL(f));
    setLogoName(f.name);
    const cols = await dominantColorsFromFile(f, 3);
    if (cols[0]) setColor(cols[0]);
  }

  const notes = `App mockup: ${venue.label}, color ${brand.primary}${logoName ? `, has logo (${logoName}) — ask them to email it` : ""}`;

  return (
    <div className={cn("grid gap-8", layout === "modal" ? "lg:grid-cols-[minmax(0,300px)_1fr]" : "lg:grid-cols-[minmax(0,340px)_1fr]")}>
      {/* Builder + phone */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5f8b]">1 · Make it yours</p>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-slate-700">Venue name</span>
            <input
              value={name}
              onChange={(e) => { touch(); setName(e.target.value.slice(0, 40)); }}
              placeholder="e.g. Sunset Fun Center"
              className="lp-focus h-11 w-full rounded-lg border border-[#e3e9f0] bg-white px-3.5 text-[15px] text-[#14213d] placeholder:text-slate-400"
              autoComplete="organization"
            />
          </label>
          <div className="grid gap-1.5 text-sm">
            <span className="text-slate-700">What do you run?</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Venue type">
              {VENUE_TYPES.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={v.id === type} onClick={() => { touch(); setType(v.id); }}
                  className={cn("lp-focus h-8 rounded-full border px-3 text-[13px] font-medium transition-colors", v.id === type ? "border-[#14213d] bg-[#14213d] text-white" : "border-[#e3e9f0] bg-white text-[#14213d] hover:border-[#14213d]/40")}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5 text-sm">
            <span className="text-slate-700">Brand color or logo</span>
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_SWATCHES.map((c) => (
                <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => { touch(); setColor(c); }}
                  className={cn("lp-focus h-7 w-7 rounded-full ring-offset-2 transition-transform hover:scale-110", c === color && "ring-2 ring-[#14213d]")}
                  style={{ background: c }} />
              ))}
              <label className="lp-focus relative grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-500" title="Custom color">
                <Pipette className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Custom color</span>
                <input type="color" value={color} onChange={(e) => { touch(); setColor(e.target.value); }} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="lp-focus inline-flex h-9 items-center gap-2 rounded-lg border border-[#e3e9f0] bg-white px-3 text-[13px] font-medium text-[#14213d] hover:border-[#14213d]/40">
                <ImagePlus className="h-4 w-4 text-[#1f5f8b]" aria-hidden /> {logoName ? "Change logo" : "Drop in your logo"}
              </button>
              {logoName && (
                <button type="button" onClick={() => { if (logo) URL.revokeObjectURL(logo); setLogo(null); setLogoName(null); }}
                  className="lp-focus inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:text-[#14213d]">
                  <X className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            </div>
            <p className="text-[11px] text-slate-500">Your logo stays in your browser — we pull the colors from it.</p>
          </div>
        </div>

        {/* Phone — scaled to fit the dialog. Phones get a toggle so the calendar stays close. */}
        <button type="button" onClick={() => setPeek((v) => !v)} className="lp-focus mt-4 inline-flex h-10 items-center rounded-full border border-[#14213d]/20 px-4 text-sm font-semibold text-[#14213d] sm:hidden" aria-expanded={peek}>
          {peek ? "Hide my app" : "Preview my app"}
        </button>
        <div className={cn("mt-6 sm:block", peek ? "block" : "hidden")}>
          <div className="relative mx-auto h-[522px] w-[246px]">
            <div className="absolute left-0 top-0 origin-top-left scale-[0.82]">
              <LiveApp brand={brand} categories={venue.categories} guest="Alex" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">Tap it — it works. This is your app on day one.</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5f8b]">2 · Pick a time</p>
        <div className="mt-3">
          <BookingCalendar
            source={source}
            firstFieldRef={firstFieldRef}
            compact={false}
            prefill={{ business: name.trim(), industry: INDUSTRY_FOR[type] }}
            extraNotes={touched.current ? notes : undefined}
          />
        </div>
      </div>
    </div>
  );
}
