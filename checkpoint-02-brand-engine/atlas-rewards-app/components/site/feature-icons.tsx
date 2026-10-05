/**
 * Feature icons for the site showcase — CP-194. Drawn for Atlas (48 grid,
 * two flat tones, no outlines) so the tab row has its own look instead of a
 * stock line-icon set. Inactive: two cool grays. Active: sky + ocean.
 */
type P = { on?: boolean; className?: string };

function tones(on?: boolean) {
  return on ? { a: "#5DB2FF", b: "#0B5FD6", w: "#FFFFFF" } : { a: "#D3DAE3", b: "#9AA7B6", w: "#FFFFFF" };
}

export function IconRecall({ on, className }: P) {
  const t = tones(on);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="21.5" y="4" width="5" height="5" rx="2.5" fill={t.b} />
      <path d="M24 7.5c-7 0-11.6 5.4-11.6 12.2v7.2l-3.5 5.2c-.8 1.2.1 2.8 1.5 2.8h27.2c1.4 0 2.3-1.6 1.5-2.8l-3.5-5.2v-7.2C35.6 12.9 31 7.5 24 7.5z" fill={t.a} />
      <path d="M19.2 37.5h9.6a4.8 4.8 0 0 1-9.6 0z" fill={t.b} />
      <path d="M17.5 20.5a6.5 6.5 0 0 1 4-6" stroke={t.w} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".75" />
      <circle cx="36" cy="11" r="5.5" fill={t.b} stroke={t.w} strokeWidth="2.5" />
    </svg>
  );
}

export function IconMembership({ on, className }: P) {
  const t = tones(on);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M15.5 26 11 42.5l6.6-2.6 4 5.3 3.6-15.6zM32.5 26 37 42.5l-6.6-2.6-4 5.3-3.6-15.6z" fill={t.b} />
      <circle cx="24" cy="19" r="14" fill={t.a} />
      <path d="m24 11.6 2.3 4.7 5.2.8-3.8 3.6.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.6 5.2-.8z" fill={t.w} />
    </svg>
  );
}

export function IconRewards({ on, className }: P) {
  const t = tones(on);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M24 16c-2.6-6.5-9.8-8.6-10.6-4.6-.6 3 3.7 4.6 10.6 4.6zM24 16c2.6-6.5 9.8-8.6 10.6-4.6.6 3-3.7 4.6-10.6 4.6z" fill={t.b} />
      <rect x="9" y="23" width="30" height="20" rx="3.5" fill={t.a} />
      <rect x="7" y="15.5" width="34" height="9" rx="3" fill={t.a} />
      <rect x="7" y="22" width="34" height="2.5" fill={t.b} opacity=".35" />
      <rect x="21.5" y="15.5" width="5" height="27.5" fill={t.b} />
    </svg>
  );
}

export function IconFinancing({ on, className }: P) {
  const t = tones(on);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="5" y="9" width="38" height="25" rx="4.5" fill={t.a} />
      <rect x="5" y="15" width="38" height="5.5" fill={t.b} />
      <rect x="10" y="25" width="10" height="3.5" rx="1.75" fill={t.w} opacity=".85" />
      <circle cx="12" cy="41" r="3.5" fill={t.b} />
      <circle cx="20" cy="41" r="3.5" fill={t.a} />
      <circle cx="28" cy="41" r="3.5" fill={t.a} />
      <circle cx="36" cy="41" r="3.5" fill={t.a} />
    </svg>
  );
}

export function IconDesk({ on, className }: P) {
  const t = tones(on);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M20 34h8l1.5 7h-11z" fill={t.b} />
      <rect x="13" y="40" width="22" height="3.5" rx="1.75" fill={t.b} />
      <rect x="5" y="7" width="38" height="27" rx="4.5" fill={t.a} />
      <circle cx="12" cy="15" r="2.2" fill={t.b} />
      <rect x="16.5" y="13.6" width="19" height="2.8" rx="1.4" fill={t.w} />
      <circle cx="12" cy="21" r="2.2" fill={t.b} />
      <rect x="16.5" y="19.6" width="15" height="2.8" rx="1.4" fill={t.w} />
      <circle cx="12" cy="27" r="2.2" fill={t.w} opacity=".7" />
      <rect x="16.5" y="25.6" width="11" height="2.8" rx="1.4" fill={t.w} opacity=".7" />
    </svg>
  );
}
