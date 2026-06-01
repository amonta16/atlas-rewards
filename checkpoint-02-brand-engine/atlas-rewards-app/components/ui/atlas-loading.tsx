/**
 * AtlasLoading — CP-41, revised CP-37.2.
 *
 * Branded loading screen shown during Next.js route transitions.
 * CP-37.2 adds `logoUrl`: when set, we render the business's actual
 * logo art instead of the generic Atlas triangle mark. Andrew kept
 * seeing the Atlas triangle on tab switches inside a sub-account —
 * confusing because it's not the local business's brand.
 *
 * Behavior:
 *   - logoUrl set → logo image inside a soft-tinted rounded square
 *   - no logoUrl → falls back to the Atlas triangle silhouette
 *   - color comes from cached brand primary (per business) or default
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
          className="h-16 w-16 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-black/5 overflow-hidden"
          style={{
            background: logoUrl
              ? "white"
              : `linear-gradient(135deg, ${color}, ${color2})`,
          }}
        >
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-contain p-2"
            />
          ) : (
            // Fallback: inline Atlas triangle mark.
            <svg viewBox="0 0 48 48" className="h-9 w-9 text-white" aria-hidden="true">
              <path d="M24 8 L42 38 L6 38 Z" fill="white" opacity="0.9" />
              <path d="M24 18 L34 36 L14 36 Z" fill={color} />
            </svg>
          )}
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
