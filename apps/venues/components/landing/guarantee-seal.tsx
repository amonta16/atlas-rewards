/**
 * components/landing/guarantee-seal.tsx — CP-264 · the 100-Patient Guarantee as a printed-style seal and a
 * terms block, not a pill. GuaranteeBand sits as the top row of the phones card on /medspa/app;
 * GuaranteeTerms is the full wording at the bottom of the page (the band links to it).
 * Wording comes from GUARANTEES[0] (lib/landing/medspa-funnel.ts), so the page and the agreement can't drift.
 */
import { GUARANTEES } from "@/lib/landing/medspa-funnel";

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
      <text fill={INK} fontSize="9.2" fontWeight="700" letterSpacing="2.1" style={{ fontFamily: "inherit" }}>
        <textPath href="#gs-ring" startOffset="0">PATIENT GUARANTEE · 90 DAYS · ATLAS ENGINE ·</textPath>
      </text>
      <text x="60" y="66.5" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="800" letterSpacing="-0.5" style={{ fontFamily: "inherit" }}>100</text>
      <text x="60" y="77" textAnchor="middle" fill="#fff" fillOpacity=".85" fontSize="5.6" fontWeight="700" letterSpacing="1.4" style={{ fontFamily: "inherit" }}>PATIENTS</text>
    </svg>
  );
}

/** The top row of the phones card: seal, the promise in one sentence, a link to the terms. */
export function GuaranteeBand() {
  const g = GUARANTEES[0];
  return (
    <div className="flex items-center gap-3.5 border-b border-[#0B1B2B]/10 px-2 pb-4 text-left sm:gap-5 sm:px-5 sm:pb-5">
      <GuaranteeSeal className="h-[58px] w-[58px] shrink-0 sm:h-[76px] sm:w-[76px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5B6B7E]">The 100-Patient Guarantee</p>
        <p className="mt-1 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#0B1B2B] sm:text-[18px]">
          100 of your patients on your app within 90 days of going live, or we refund every dollar.
        </p>
      </div>
      <a href="#pv-guarantee" className="s-focus hidden shrink-0 rounded text-[13.5px] font-semibold text-[#0B5FD6] underline decoration-[#0B5FD6]/30 underline-offset-4 hover:decoration-[#0B5FD6] sm:block">
        Read the terms
      </a>
      <span className="sr-only">{g.short}</span>
    </div>
  );
}

/** The full wording, at the bottom of the page. */
export function GuaranteeTerms() {
  const g = GUARANTEES[0];
  return (
    <section id="pv-guarantee" aria-labelledby="pv-guarantee-h" className="s-wrap mx-auto mb-6 max-w-[40rem] scroll-mt-24">
      <div className="flex gap-4 rounded-2xl border border-[#0B1B2B]/12 p-5 text-left">
        <GuaranteeSeal className="hidden h-14 w-14 shrink-0 sm:block" />
        <div className="min-w-0">
          <h2 id="pv-guarantee-h" className="text-[14px] font-semibold text-[#0B1B2B]">The 100-Patient Guarantee</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#3A4A5C]">{g.body}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#6B7A8C]"><span className="font-semibold text-[#3A4A5C]">Terms.</span> {g.fine} Written into your client agreement.</p>
        </div>
      </div>
    </section>
  );
}
