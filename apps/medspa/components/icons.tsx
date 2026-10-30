/** Line icons, 1.7px stroke, drawn on a 24 grid. */
type P = React.SVGProps<SVGSVGElement>;
const base = (d: React.ReactNode, p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>{d}</svg>
);

export const IcHome = (p: P) => base(<><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></>, p);
export const IcBag = (p: P) => base(<><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>, p);
export const IcGift = (p: P) => base(<><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11M12 9c-1.5-3-5-3.5-5-1.2C7 9 12 9 12 9Zm0 0c1.5-3 5-3.5 5-1.2C17 9 12 9 12 9Z" /></>, p);
export const IcUser = (p: P) => base(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>, p);
export const IcSearch = (p: P) => base(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>, p);
export const IcBack = (p: P) => base(<path d="M14.5 5.5 8 12l6.5 6.5" />, p);
export const IcNext = (p: P) => base(<path d="M9.5 5.5 16 12l-6.5 6.5" />, p);
export const IcDown = (p: P) => base(<path d="m6 9.5 6 6 6-6" />, p);
export const IcCheck = (p: P) => base(<><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.5 2.5 4.9-5.2" /></>, p);
export const IcClose = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p);
export const IcFilter = (p: P) => base(<path d="M4 7h16M7 12h10M10 17h4" />, p);
export const IcPhone = (p: P) => base(<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3A2.5 2.5 0 0 1 17.3 20 15 15 0 0 1 4 6.7 2.5 2.5 0 0 1 6.5 4Z" />, p);
export const IcChat = (p: P) => base(<path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z" />, p);
export const IcCalendar = (p: P) => base(<><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>, p);
export const IcQr = (p: P) => base(<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM18 18h2v2h-2zM14 19.5h1.5M19.5 14v2" /></>, p);
export const IcPin = (p: P) => base(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10" r="2.3" /></>, p);
export const IcSpark = (p: P) => base(<path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 10.9 10.2 9z" />, p);
export const IcClock = (p: P) => base(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, p);
export const IcOut = (p: P) => base(<><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>, p);
export const IcSwap = (p: P) => base(<path d="M7 7h12l-3-3M17 17H5l3 3" />, p);
