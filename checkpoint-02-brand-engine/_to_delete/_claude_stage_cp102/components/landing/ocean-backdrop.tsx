/**
 * Ocean backdrop — CP-102. One fixed layer behind the whole landing page:
 * a calm Morro-Bay blue gradient, a few slow-drifting bokeh circles, and
 * the Atlas icon as a faint watermark. Pure CSS + one small PNG; sized down
 * on phones so it never competes with text.
 */
export function OceanBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Base gradient */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#062a44_0%,#0a3d62_28%,#14588a_55%,#1c6f9f_78%,#0b3b5e_100%)]" />
      {/* Bokeh */}
      <div className="lp-drift absolute -left-[10%] top-[-6%] h-[46vw] w-[46vw] max-h-[560px] max-w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(125,211,252,0.35),transparent)] blur-2xl" />
      <div className="lp-drift-2 absolute right-[-12%] top-[18%] h-[40vw] w-[40vw] max-h-[520px] max-w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.28),transparent)] blur-2xl" />
      <div className="lp-drift absolute left-[30%] top-[55%] h-[34vw] w-[34vw] max-h-[440px] max-w-[440px] rounded-full bg-[radial-gradient(closest-side,rgba(186,230,253,0.22),transparent)] blur-2xl" />
      <div className="lp-drift-2 absolute right-[5%] bottom-[-8%] h-[38vw] w-[38vw] max-h-[480px] max-w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(14,116,144,0.45),transparent)] blur-2xl" />
      {/* Small sharp bokeh dots */}
      {[
        ["12%", "34%", 10, 0.5], ["68%", "12%", 14, 0.35], ["82%", "62%", 8, 0.45], ["24%", "78%", 12, 0.3], ["50%", "22%", 6, 0.5], ["90%", "40%", 9, 0.35],
      ].map(([l, t, s, o], i) => (
        <span key={i} className="absolute rounded-full bg-white blur-[2px]" style={{ left: l as string, top: t as string, width: s as number, height: s as number, opacity: o as number }} />
      ))}
      {/* Atlas icon watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/atlas-icon-white.png"
        alt=""
        width={1100}
        height={852}
        className="absolute right-[-18%] top-[14%] w-[78vw] max-w-[820px] opacity-[0.05] sm:right-[-8%] sm:top-[6%] sm:w-[52vw] sm:opacity-[0.06]"
      />
      {/* Grain */}
      <div className="lp-noise absolute inset-0 opacity-70" />
    </div>
  );
}
