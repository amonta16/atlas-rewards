/**
 * Tab-switch loading skeleton — CP-106.
 *
 * This boundary fires on EVERY move between customer tabs, and it used to
 * render <BrandedLoading/>, which is `min-h-screen` with the business logo and
 * an animated ping. So a tab tap collapsed the content area into a full-height
 * brand splash and then swapped back — the app read as "loading somewhere
 * else" even once the navigation itself was fast.
 *
 * Cold boot still gets the branded splash: that comes from the OUTER boundary
 * at app/[business]/loading.tsx, which is untouched. This one only covers
 * tab-to-tab, so it stays the size and shape of the content it replaces.
 *
 * `--surf-fg` is the auto-contrast color from CP-54, so these blocks stay
 * visible on a white surface and on a dark custom one.
 */
export default function CustomerAppLoading() {
  const block = { background: "var(--surf-fg, #18181b)", opacity: 0.07 };
  return (
    <div className="px-4 pt-4 pb-8 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-32 rounded-full" style={block} />
      <div className="h-44 rounded-3xl" style={block} />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-40 rounded-2xl" style={block} />
        <div className="h-40 rounded-2xl" style={block} />
      </div>
    </div>
  );
}
