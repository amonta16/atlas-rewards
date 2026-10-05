/**
 * Med spa app icon set — CP-193. Thin, rounded outline glyphs drawn for this
 * app (1.6 stroke on a 24 grid) so the nav and lists share one hand.
 */
type P = { className?: string; style?: React.CSSProperties; strokeWidth?: number };

function Svg({ className, style, strokeWidth = 1.6, children }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      {children}
    </svg>
  );
}

export const IcHome = (p: P) => <Svg {...p}><path d="M4 10.4 12 4l8 6.4v8.6a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z" /><path d="M9.2 14.6c1.6 1.5 4 1.5 5.6 0" /></Svg>;
export const IcBag = (p: P) => <Svg {...p}><path d="M5.6 8.4h12.8l-.8 10.7a1.9 1.9 0 0 1-1.9 1.8H8.3a1.9 1.9 0 0 1-1.9-1.8z" /><path d="M9 8.4V7.2a3 3 0 0 1 6 0v1.2" /></Svg>;
export const IcScan = (p: P) => <Svg {...p}><path d="M4 8.5V6.2A2.2 2.2 0 0 1 6.2 4h2.3M15.5 4h2.3A2.2 2.2 0 0 1 20 6.2v2.3M20 15.5v2.3a2.2 2.2 0 0 1-2.2 2.2h-2.3M8.5 20H6.2A2.2 2.2 0 0 1 4 17.8v-2.3" /><path d="M7.5 12h9" strokeDasharray="1.6 2.2" /></Svg>;
export const IcGift = (p: P) => <Svg {...p}><path d="M5 11.2h14v8.2a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 19.4z" /><path d="M3.8 7.6h16.4v3.6H3.8zM12 7.6v13" /><path d="M12 7.6S10.6 3.8 8.3 4.6C6.4 5.3 7.6 7.6 12 7.6zM12 7.6s1.4-3.8 3.7-3c1.9.7.7 3-3.7 3z" /></Svg>;
export const IcUser = (p: P) => <Svg {...p}><circle cx="12" cy="8.2" r="3.6" /><path d="M5 20c1.1-3.6 3.9-5.2 7-5.2s5.9 1.6 7 5.2" /></Svg>;
export const IcUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.9-3.2 3.1-4.6 5.5-4.6s4.6 1.4 5.5 4.6" /><path d="M15.2 5.6a3 3 0 0 1 0 5.8M17 15.2c1.8.5 3 1.9 3.5 4.3" /></Svg>;
export const IcStar = (p: P) => <Svg {...p}><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" /></Svg>;
export const IcQr = (p: P) => <Svg {...p}><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><path d="M14 14h2.5v2.5H14zM18 18h2v2M14 19.5V20M20 14v1.5" /></Svg>;
export const IcChevronRight = (p: P) => <Svg {...p}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></Svg>;
export const IcChevronLeft = (p: P) => <Svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
export const IcLock = (p: P) => <Svg {...p}><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const IcClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IcCard = (p: P) => <Svg {...p}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17M7 14.5h3" /></Svg>;
export const IcCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const IcHeart = (p: P) => <Svg {...p}><path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" /></Svg>;
export const IcCalendar = (p: P) => <Svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>;
export const IcSparkle = (p: P) => <Svg {...p}><path d="M12 4.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5z" /><path d="M18.5 15.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z" /></Svg>;
