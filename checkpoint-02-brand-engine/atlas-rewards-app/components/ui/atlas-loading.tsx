/**
 * AtlasLoading — CP-41, revised CP-37.2, restyled CP-115.
 *
 * Branded loading screen shown during Next.js route transitions.
 *
 * CP-115 (Andrew): the screen used to be mostly WHITE with a faint brand
 * tint, which read as a blank flash on app open and clashed with the boot
 * splash. It's now a FULL brand-color background with the business logo in a
 * clean white tile (object-contain, generous padding — never cropped) and
 * white text, so every loading surface (boot splash, this, the join splash)
 * looks like the same continuous branded screen instead of white flashes.
 */
import { Loader2 } from "lucide-react";

export function AtlasLoading({
  primary,
  title,
  subtitle,
  logoUrl,
}: {
  /** Optional brand color override. Defaults to Atlas ocean-blue. */
  primary?: string;
  /** Optional title — defaults to "Loading…" */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
  /** CP-37.2 — optional business logo URL. When set, replaces the
   *  generic Atlas triangle mark with the business's actual logo. */
  logoUrl?: string | null;
}) {
  const color = primary ?? "#0a3d62";
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6"
      style={{
        // Full brand-color canvas with a soft top highlight + slight bottom
        // shade for depth — no white. Works for any brand hue.
        background: `${color} radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,0.22), rgba(0,0,0,0.20) 90%)`,
      }}
    >
      {/* Pulsing logo mark */}
      <div className="relative">
        <div className="h-24 w-24 rounded-3xl flex items-center justify-center shadow-2xl ring-1 ring-white/40 bg-white">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-contain p-3.5"
            />
          ) : (
            // Fallback: inline Atlas triangle mark in the brand color.
            <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
              <path d="M24 8 L42 38 L6 38 Z" fill={color} opacity="0.25" />
              <path d="M24 16 L36 37 L12 37 Z" fill={color} />
            </svg>
          )}
        </div>
        {/* Soft white pulse ring */}
        <div className="absolute -inset-2 rounded-[1.75rem] animate-ping opacity-20 bg-white" />
      </div>

      <div className="mt-7 text-center">
        <div className="text-base font-extrabold tracking-tight text-white">
          {title ?? "Loading…"}
        </div>
        {subtitle && <div className="text-xs text-white/70 mt-1">{subtitle}</div>}
      </div>

      <Loader2 className="h-5 w-5 animate-spin mt-5 text-white/80" />
    </div>
  );
}
