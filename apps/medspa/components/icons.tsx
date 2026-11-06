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
/** Scan tab: viewfinder corners with a dashed centre line. */
export const IcScan = (p: P) => base(<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M8 12h1.5M11.25 12h1.5M14.5 12H16" /></>, p);
export const IcLock = (p: P) => base(<><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>, p);
export const IcPeople = (p: P) => base(<><circle cx="9.5" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.8c1.6.7 2.7 2.3 3 4.7" /></>, p);
export const IcBell = (p: P) => base(<><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>, p);
export const IcEye = (p: P) => base(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>, p);
export const IcBank = (p: P) => base(<path d="M4 9.5 12 4l8 5.5M5 9.5h14M6.5 9.5V17M10.2 9.5V17M13.8 9.5V17M17.5 9.5V17M4.5 20h15M5.5 17h13" />, p);
export const IcChart = (p: P) => base(<path d="M4 20h16M7 16.5v-5M12 16.5V6M17 16.5V9.5" />, p);
export const IcCard = (p: P) => base(<><rect x="3.5" y="6" width="17" height="12.5" rx="2" /><path d="M3.5 10.5h17M7 15h3" /></>, p);
export const IcMail = (p: P) => base(<><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7.5 8 6 8-6" /></>, p);
export const IcHeart = (p: P) => base(<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.500 15.400 12 20 12 20Z" />, p);
/** Atlas Engine's own mark: the hexagon with a triangle cut out (same shape as the old portal's icon). */
export const IcEngine = (p: P) => base(<><path d="M8.6 4.5h6.8a1.6 1.6 0 0 1 1.4.8l3.4 5.900a1.6 1.6 0 0 1 0 1.600l-3.400 5.900a1.600 1.600 0 0 1-1.400.800H8.600a1.600 1.600 0 0 1-1.400-.800l-3.400-5.900a1.600 1.600 0 0 1 0-1.600l3.400-5.900a1.600 1.600 0 0 1 1.400-.800z" /><path d="m12 9.200-2.600 4.600h5.200z" /></>, p);
export const IcCrown = (p: P) => base(<path d="M4 8l4 4 4-7 4 7 4-4-1.5 10.5h-13z" />, p);
export const IcRefresh = (p: P) => base(<path d="M19.5 8.5A8 8 0 0 0 5 8M4.5 15.5A8 8 0 0 0 19 16M5 4v4h4M19 20v-4h-4" />, p);
export const IcStar = (p: P) => base(<path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2 8 13.7 4 9.8 9.6 9z" />, p);
export const IcTag = (p: P) => base(<><path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5a1.5 1.5 0 0 1 0 2.1L13.6 20a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8.5" cy="8.5" r="1.3" /></>, p);
export const IcMore = (p: P) => base(<><circle cx="12" cy="5.5" r="1.1" fill="currentColor" /><circle cx="12" cy="12" r="1.1" fill="currentColor" /><circle cx="12" cy="18.5" r="1.1" fill="currentColor" /></>, p);
/** Multi-colour Google "G" for the review row. */
export const IcGoogle = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden {...p}>
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2Z" />
    <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z" />
  </svg>
);

/* Shop category icons (fine line, Browse tab). */
const SKIN = <><path d="M3.5 9.5c2-1.6 3.6-1.6 5.6 0s3.6 1.6 5.6 0 3.6-1.6 5.8 0" /><path d="M3.5 14c2-1.6 3.6-1.6 5.6 0s3.6 1.6 5.6 0 3.6-1.6 5.8 0" /><path d="M6 18h.01M10 18h.01M14 18h.01M18 18h.01M7.5 5.5h.01M12 5.5h.01M16.5 5.5h.01" /></>;
const SYRINGE = <path d="m17.5 3.5 3 3M19 5l-3 3M14.5 5.5l4 4M16 8l-8.5 8.5-3-.5-.5-3L12.500 4.500M9.500 10.500l1.500 1.500M7.500 12.500l1.500 1.500M4.500 16.500 2.800 18.200" />;
const LASER = <><path d="M4 20 14.500 9.500" /><path d="m12.500 7.500 4 4 3-3-4-4z" /><path d="M5 11.500h.01M3 15h.01M9.500 19h.01M13 21h.01" /></>;
const BODY = <><circle cx="12" cy="4.800" r="2" /><path d="M7 9.500c3 1 7 1 10 0M12 10.300V15M12 15l-2.500 6M12 15l2.500 6M7 9.500 5.500 14M17 9.500l1.500 4.500" /></>;
const FACE = <><path d="M7 7.500C7 5 9.300 3.500 12 3.500S17 5 17 7.500V11c0 4-2.700 7-5 7s-5-3-5-7z" /><path d="M9.800 10.500h.01M14.200 10.500h.01M10.300 14.200c1 .8 2.400.8 3.400 0M9 20.500h6" /></>;
export function IcCategory({ name, ...p }: P & { name: string }) {
  const n = name.toLowerCase();
  const d = /inject|filler|tox|lip/.test(n) ? SYRINGE : /laser|ipl|light/.test(n) ? LASER : /body|sculpt|contour/.test(n) ? BODY : /face|facial/.test(n) ? FACE : SKIN;
  return base(d, { strokeWidth: 1.25, ...p });
}
