/**
 * AtlasLoading — CP-41
 *
 * Branded loading screen shown during Next.js route transitions
 * (via loading.tsx convention). Soft animated logo + tagline.
 * Designed to feel intentional, not "this is broken." Friends
 * gave feedback the app felt unresponsive — this surfaces the
 * "we're loading" moment so taps feel acknowledged.
 *
 * Two variants:
 *   - <AtlasLoading /> — full-screen Atlas brand (agency surfaces)
 *   - <AtlasLoading primary={hex} title="..." /> — per-business
 *     brand color, used in customer + manager surfaces
 */
import { Loader2 } from "lucide-react";

export function AtlasLoading({
  primary,
  title,
  subtitle,
}: {
  /** Optional brand color override. Defaults to Atlas ocean-blue. */
  primary?: string;
  /** Optional title — defaults to "Loading…" */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
}) {
  const color = primary ?? "#0a3d62";
  const color2 = "#2a8cc4";
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6"
      style={{
        background: `linear-gradient(180deg, ${color}08 0%, white 60%, ${color}05 100%)`,
      }}
    >
      {/* Pulsing logo mark */}
      <div className="relative">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center text-white shadow-xl ring-1 ring-black/5"
          style={{ background: `linear-gradient(135deg, ${color}, ${color2})` }}
        >
          {/* Inline triangle mark — matches the Atlas logo silhouette */}
          <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
            <path
              d="M24 8 L42 38 L6 38 Z"
              fill="white"
              opacity="0.9"
            />
            <path
              d="M24 18 L34 36 L14 36 Z"
              fill={color}
            />
          </svg>
        </div>
        {/* Soft pulse ring */}
        <div
          className="absolute -inset-2 rounded-3xl animate-ping opacity-25"
          style={{ background: color }}
        />
      </div>

      <div className="mt-6 text-center">
        <div className="text-sm font-extrabold tracking-tight" style={{ color }}>
          {title ?? "Loading…"}
        </div>
        {subtitle && (
          <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>
        )}
      </div>

      <Loader2 className="h-4 w-4 animate-spin mt-4" style={{ color }} />
    </div>
  );
}
