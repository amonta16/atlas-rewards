/**
 * AtlasEngineIcon — CP-210 · the "Atlas Engine" (marketing) tab icon
 *
 * The Atlas mark (rounded hexagon frame around a triangle) drawn as a
 * line icon so it sits in the sidebar next to lucide icons, plus a small
 * spark — "the engine is running". Inherits currentColor + className
 * like a lucide icon.
 */
export function AtlasEngineIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden>
      {/* Atlas frame: the logo's rounded hexagon-triangle */}
      <path d="M8.6 4.5h6.8a1.6 1.6 0 0 1 1.4.8l3.4 5.9a1.6 1.6 0 0 1 0 1.6l-3.4 5.9a1.6 1.6 0 0 1-1.4.8H8.6a1.6 1.6 0 0 1-1.4-.8l-3.4-5.9a1.6 1.6 0 0 1 0-1.6l3.4-5.9a1.6 1.6 0 0 1 1.4-.8z" />
      {/* Inner peak */}
      <path d="M12 9.2l2.6 4.6H9.4z" fill="currentColor" stroke="none" />
      {/* Spark */}
      <path d="M20.5 1.8v2.6M19.2 3.1h2.6" strokeWidth={1.6} />
    </svg>
  );
}
