/**
 * components/guarantee-seal.tsx — CP-265 · the 100-Patient Guarantee on /p/<slug> (moved here from the venue
 * site's /medspa/app, which now asks for nothing but the spa's name). A printed-style seal, a one-line band
 * for the call offer, and the full terms near the bottom of the page (the band links to them).
 * Wording: GUARANTEE_100 in lib/offer.ts, sync-tested against the venue site's GUARANTEES[0].
 * Atlas's own navy and blue, not the clinic's color: it's Atlas's promise.
 */
import { GUARANTEE_100 } from "@/lib/offer";

const INK = "#0B1B2B";
const BLUE = "#0B5FD6";

/** A round seal: "100" in the middle, the guarantee's name set around the ring, like a stamp. */
export function GuaranteeSeal({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="100-Patient Guarantee seal">
      <defs>
        <path id="gs-ring" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <circle cx="60" cy="60" r="51.5" fill="none" stroke={INK} strokeWidth="0.8" />
      <circle cx="60" cy="60" r="31" fill={BLUE} />
      <circle cx="60" cy="60" r="27.5" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="0.8" />
      {/* Sized so the words just close up around the ring (circumference ≈ 258; this set measures ≈ 253). */}
      <text fill={INK} fontSize="8.2" fontWeight="700" letterSpacing="1.5" style={{ fontFamily: "inherit" }}>
        <textPath href="#gs-ring" startOffset="2">PATIENT GUARANTEE · 90 DAYS · ATLAS ENGINE · </textPath>
      </text>
      <text x="60" y="66.5" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="800" letterSpacing="-0.5" style={{ fontFamily: "inherit" }}>100</text>
      <text x="60" y="77" textAnchor="middle" fill="#fff" fillOpacity=".85" fontSize="5.6" fontWeight="700" letterSpacing="1.4" style={{ fontFamily: "inherit" }}>PATIENTS</text>
    </svg>
  );
}

/** The bottom row of the call offer: seal, the promise in one sentence, a link to the terms. */
export function GuaranteeBand() {
  return (
    <div className="flex items-center gap-3.5 border-t border-line bg-[#FAFAF9] px-5 py-4">
      <GuaranteeSeal className="h-[58px] w-[58px] shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sub">{GUARANTEE_100.name}</p>
        <p className="mt-0.5 text-[14.5px] font-semibold leading-snug text-ink">{GUARANTEE_100.line}</p>
        <a href="#pv-guarantee" className="mt-1 inline-block text-[13px] font-semibold text-[#0B5FD6] underline decoration-[#0B5FD6]/30 underline-offset-4">Read the terms</a>
      </div>
    </div>
  );
}

/** The full wording, near the bottom of the page. */
export function GuaranteeTerms() {
  return (
    <section id="pv-guarantee" aria-labelledby="pv-guarantee-h" className="mx-auto mt-12 max-w-[640px] scroll-mt-24">
      <div className="flex gap-4 rounded-[24px] bg-white p-5 shadow-soft ring-1 ring-line">
        <GuaranteeSeal className="hidden h-14 w-14 shrink-0 sm:block" />
        <div className="min-w-0">
          <h2 id="pv-guarantee-h" className="text-[15px] font-semibold text-ink">{GUARANTEE_100.name}</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink">{GUARANTEE_100.body}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-sub"><b className="font-semibold text-ink">Terms.</b> {GUARANTEE_100.fine}</p>
        </div>
      </div>
    </section>
  );
}
