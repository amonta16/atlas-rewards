/**
 * lib/automations/arcade-email.ts — CP-261 · the email layout for entertainment venues (Flippo's).
 *
 * A fun, game-night frame filled entirely from what the venue already set up: name, logo, brand colours,
 * hero photo, prize-counter rewards (names, point costs, photos), phone and address. Nobody designs an
 * email per venue; a blue venue gets a blue marquee, a red one a red one.
 *
 *   marquee header (logo chip, "Player rewards")
 *   scoreboard (player name, live points in big digits, bar to the next prize, Redeem button)
 *   photo (the prize the email is about → next prize → venue hero)
 *   headline + body + one big button + a ticket-stub footnote
 *   the prize counter (2×2: ready prizes link straight to Redeem, locked ones show points to go)
 *   quick links (book, prizes, call) + footer with address and unsubscribe
 *
 * Used by the dispatcher (app/api/automations/email-dispatch, the real send), the desk preview
 * (components/manager/venue-automations.tsx) and the test send (app/api/automations/venue-email).
 *
 * Pure function: no React, no fetching, email-client-safe HTML (tables, inline styles, no SVG, no flexbox).
 * Every link is a plain <a href> to an absolute URL the caller builds, so every button works in every
 * mail app. Display font is Lilita One where the mail app loads web fonts (Apple Mail / iOS), a heavy
 * system sans everywhere else.
 */

export type ArcadeEmailBrand = {
  businessName: string;
  logoUrl: string | null;
  /** Brand primary hex. Unreadable values fall back to Atlas blue. */
  primary: string;
  /** Optional brand secondary hex (used for the marquee glow). */
  secondary?: string | null;
  heroUrl?: string | null;
  address?: string | null;
  phone?: string | null;
};

export type ArcadeEmailPrize = { id?: string | null; name: string; pointCost: number; imageUrl: string | null };

export type ArcadeQuickLink = { label: string; url: string };

export type ArcadeEmailInput = {
  brand: ArcadeEmailBrand;
  subject: string;
  preheader?: string | null;
  firstName: string | null;
  points: number;
  headline: string;
  body?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footnote?: string | null;
  /** The prize counter screen (/app/rewards). */
  rewardsUrl: string;
  /** Builds the link for one ready prize (/app/rewards?redeem=<id>). Defaults to rewardsUrl. */
  redeemUrl?: (prizeId: string) => string;
  /** Prize-counter rewards (show_in_store) — the counter and the bar come from these. */
  prizes: ArcadeEmailPrize[];
  /** The prize this email is about (unlocked / almost there / expiring): its photo leads, its card comes first. */
  featuredPrizeId?: string | null;
  heroUrl?: string | null;
  quickLinks?: ArcadeQuickLink[];
  unsubscribeUrl: string;
};

const FALLBACK = "#0284c7";
const INK = "#14213d";
const GOLD = "#ffc93c";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHex = (h: string | null | undefined) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null);
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Darken until it reads on `bg` (pale brand colours still give legible buttons and text). */
const readable = (c: string, bg: string, min: number) => { let out = c; for (let i = 0; i < 16 && contrast(out, bg) < min; i++) out = mix(out, "#000000", 0.1); return out; };
const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString("en-US");
const possessive = (n: string) => (/s$/i.test(n.trim()) ? `${n.trim()}'` : `${n.trim()}'s`);
const telHref = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.length >= 7 ? `tel:${d.startsWith("+") ? d : d.length === 10 ? `+1${d}` : d}` : null; };
const prettyPhone = (p: string) => { const d = p.replace(/\D/g, ""); const t = d.length === 11 && d.startsWith("1") ? d.slice(1) : d; return t.length === 10 ? `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}` : p; };

const DISPLAY = "'Lilita One','Arial Rounded MT Bold','Arial Black',Helvetica,Arial,sans-serif";
const SANS = "'Nunito','Helvetica Neue',Helvetica,Arial,sans-serif";
const DIGITS = "'Courier New',Courier,monospace";

/** Which four prizes the counter shows: the featured one, the best ones already in reach, then what's next. */
export function pickCounter(prizes: ArcadeEmailPrize[], points: number, featuredId?: string | null) {
  const list = prizes.filter((p) => p.pointCost > 0 && p.name.trim()).sort((a, b) => a.pointCost - b.pointCost);
  const ready = list.filter((p) => p.pointCost <= points).reverse();
  const locked = list.filter((p) => p.pointCost > points);
  const featured = list.find((p) => p.id && p.id === featuredId) ?? null;
  const out: ArcadeEmailPrize[] = featured ? [featured] : [];
  const add = (p: ArcadeEmailPrize) => { if (out.length < 4 && !out.includes(p)) out.push(p); };
  ready.slice(0, 2).forEach(add);
  locked.forEach(add);
  ready.forEach(add);
  return { cards: out, readyCount: ready.length, next: locked[0] ?? null, prev: ready[0] ?? null, total: list.length };
}

export function renderArcadeEmail(x: ArcadeEmailInput): { html: string; text: string } {
  x = { ...x, brand: { ...x.brand, businessName: x.brand.businessName.trim() || "Your rewards" } };
  const p = safeHex(x.brand.primary) ?? FALLBACK;
  const sec = safeHex(x.brand.secondary) ?? mix(p, "#ffffff", 0.35);
  const page = mix("#ffffff", p, 0.07);              // page background
  const tint = mix("#ffffff", p, 0.12);              // card borders, bar track
  const navy = mix(mix(p, "#000000", 0.62), "#0b1026", 0.45); // scoreboard
  const btn = readable(p, "#ffffff", 3.2);           // button fill
  const btnEdge = mix(btn, "#000000", 0.28);         // the "3D" bottom edge
  const onBtn = contrast("#ffffff", btn) >= 3 ? "#ffffff" : INK;
  const deep = readable(mix(p, "#000000", 0.15), "#ffffff", 5); // headlines on white
  const onBand = contrast("#ffffff", p) >= 2.4 ? "#ffffff" : INK;
  const muted = "#55607a";
  const faint = "#8a93a8";

  const pts = Math.max(0, Math.floor(x.points || 0));
  const counter = pickCounter(x.prizes, pts, x.featuredPrizeId);
  const featured = counter.cards.find((c) => c.id && c.id === x.featuredPrizeId) ?? null;
  const heroUrl = x.heroUrl || featured?.imageUrl || counter.next?.imageUrl || x.brand.heroUrl || counter.cards.find((c) => c.imageUrl)?.imageUrl || null;
  const name = x.firstName?.trim() || null;
  const paras = (x.body ?? "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const redeem = (id?: string | null) => (id && x.redeemUrl ? x.redeemUrl(id) : x.rewardsUrl);

  // bar: from the best prize already in reach (or 0) to the next one
  const lo = counter.prev?.pointCost ?? 0;
  const hi = counter.next?.pointCost ?? 0;
  const pct = counter.next ? Math.round(Math.min(1, Math.max(0, (pts - lo) / Math.max(1, hi - lo))) * 100) : 100;
  const barLabel = counter.next
    ? `${fmt(counter.next.pointCost - pts)} points to ${counter.next.name}`
    : counter.total ? "Every prize on the counter is in reach!" : "Earn points every visit";

  const button = (label: string, url: string, size: "big" | "small" = "big") => {
    const big = size === "big";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>
<td align="center" bgcolor="${btn}" style="background:${btn};border-radius:999px;border-bottom:${big ? 5 : 4}px solid ${btnEdge}">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:${big ? "17px 38px 15px" : "11px 22px 10px"};font-family:${DISPLAY};font-size:${big ? 20 : 15}px;line-height:1.1;letter-spacing:.02em;color:${onBtn};text-decoration:none;border-radius:999px">${esc(label)}</a>
</td></tr></table>`;
  };

  const logo = x.brand.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:22px;padding:10px 22px;border-bottom:4px solid ${mix(p, "#000000", 0.25)}"><img src="${esc(x.brand.logoUrl)}" alt="${esc(x.brand.businessName)}" height="54" style="height:54px;max-width:210px;display:block;border:0"></td></tr></table>`
    : `<div style="font-family:${DISPLAY};font-size:34px;line-height:1.1;color:${onBand}">${esc(x.brand.businessName)}</div>`;

  const card = (c: ArcadeEmailPrize) => {
    const ready = c.pointCost <= pts;
    const url = ready ? redeem(c.id) : x.rewardsUrl;
    const tag = ready
      ? `<span style="display:inline-block;background:#16a34a;color:#ffffff;font-family:${DISPLAY};font-size:13px;letter-spacing:.06em;padding:5px 11px 4px;border-radius:999px">READY!</span>`
      : `<span style="display:inline-block;background:#eef1f6;color:${muted};font-family:${SANS};font-weight:800;font-size:12px;padding:5px 11px;border-radius:999px">${fmt(c.pointCost - pts)} to go</span>`;
    return `<div style="display:inline-block;vertical-align:top;width:100%;max-width:262px;margin:0 6px 14px;text-align:left">
<a href="${esc(url)}" target="_blank" style="display:block;text-decoration:none;color:${INK};background:#ffffff;border:2px solid ${ready ? "#86efac" : tint};border-radius:20px;overflow:hidden">
  <div style="line-height:0;background:${tint}">${c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(c.name)}" width="262" height="168" style="width:100%;max-width:262px;height:168px;object-fit:cover;display:block;border:0;${ready ? "" : "opacity:.6;"}">`
    : `<div style="height:168px;background:${tint}"></div>`}</div>
  <div style="padding:12px 14px 14px">
    ${tag}
    <div style="padding-top:8px;font-family:${DISPLAY};font-size:19px;line-height:1.15;color:${ready ? INK : muted}">${esc(c.name)}</div>
    <div style="padding-top:6px;font-family:${SANS};font-weight:800;font-size:13px;color:${ready ? deep : faint}">&#9679; ${fmt(c.pointCost)} pts &nbsp;<span style="color:${ready ? "#16a34a" : faint}">${ready ? "Tap to redeem &rsaquo;" : "See it &rsaquo;"}</span></div>
  </div>
</a></div>`;
  };

  const quick = (x.quickLinks ?? []).filter((q) => q.label && q.url).slice(0, 3);
  const tel = x.brand.phone ? telHref(x.brand.phone) : null;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(x.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;800&display=swap" rel="stylesheet">
<style>a{color:${deep}} @media (max-width:520px){.pad{padding-left:18px!important;padding-right:18px!important}.h1{font-size:32px!important}}</style></head>
<body style="margin:0;padding:0;background:${page};font-family:${SANS};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(x.preheader ?? `${name ? `${name}, you` : "You"} have ${fmt(pts)} points`)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${page}" style="background:${page}"><tr><td align="center" style="padding:18px 8px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">

<!-- marquee -->
<tr><td bgcolor="${p}" style="background:${p};background-image:linear-gradient(160deg,${sec} 0%,${p} 55%,${mix(p, "#000000", 0.2)} 100%);border-radius:30px 30px 0 0;padding:14px 18px 0;text-align:center">
  <div style="font-size:15px;line-height:1;letter-spacing:10px;color:${GOLD}">&#9733; &#9679; &#9733; &#9679; &#9733;</div>
  <div style="padding:16px 0 14px">${logo}</div>
  <div style="font-family:${DISPLAY};font-size:15px;letter-spacing:.22em;color:${onBand};padding-bottom:18px">PLAYER REWARDS</div>
</td></tr>

<!-- scoreboard -->
<tr><td bgcolor="${navy}" style="background:${navy};padding:22px 20px 24px;border-bottom:6px solid ${GOLD}" class="pad">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle">
      <div style="font-family:${SANS};font-weight:800;font-size:12px;letter-spacing:.2em;color:${mix(GOLD, "#ffffff", 0.4)};text-transform:uppercase">${esc(name ? `Player: ${name}` : "Your score")}</div>
      <div style="padding-top:4px;font-family:${DIGITS};font-weight:700;font-size:44px;line-height:1.05;letter-spacing:.04em;color:${GOLD};text-shadow:0 0 14px rgba(255,201,60,.55)">${fmt(pts)}</div>
      <div style="font-family:${DISPLAY};font-size:14px;letter-spacing:.16em;color:#ffffff">POINTS</div>
    </td>
    <td align="right" style="vertical-align:middle;width:150px">${button("Redeem", x.rewardsUrl, "small")}</td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr><td bgcolor="${mix(navy, "#ffffff", 0.14)}" style="background:${mix(navy, "#ffffff", 0.14)};border-radius:999px;height:14px;line-height:14px;font-size:0">
    <table role="presentation" width="${Math.max(pct, 4)}%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${GOLD}" style="background:${GOLD};background-image:linear-gradient(90deg,${GOLD},#ff9f1c);border-radius:999px;height:14px;line-height:14px;font-size:0">&nbsp;</td></tr></table>
  </td></tr></table>
  <div style="padding-top:9px;font-family:${SANS};font-weight:800;font-size:13.5px;color:#dbe4f5">${esc(barLabel)}</div>
</td></tr>

${heroUrl ? `<!-- photo -->
<tr><td bgcolor="#ffffff" style="background:#ffffff;line-height:0"><img src="${esc(heroUrl)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;max-height:420px;object-fit:cover;display:block;border:0"></td></tr>` : ""}

<!-- message -->
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:34px 34px 34px;text-align:center;border-radius:0 0 30px 30px" class="pad">
  <h1 class="h1" style="margin:0;font-family:${DISPLAY};font-weight:400;font-size:38px;line-height:1.1;color:${deep}">${esc(x.headline)}</h1>
  ${paras.map((s) => `<p style="margin:16px auto 0;max-width:460px;font-family:${SANS};font-weight:600;font-size:16.5px;line-height:1.6;color:${muted}">${esc(s).replace(/\n/g, "<br>")}</p>`).join("")}
  ${x.ctaLabel && x.ctaUrl ? `<div style="padding-top:26px">${button(x.ctaLabel, x.ctaUrl)}</div>` : ""}
  ${x.footnote ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0"><tr>
    <td bgcolor="#fff6d6" style="background:#fff6d6;border:2px dashed #e0a800;border-radius:14px;padding:12px 18px;font-family:${DISPLAY};font-size:16px;line-height:1.3;color:#7a5200">&#9733; ${esc(x.footnote)} &#9733;</td></tr></table>` : ""}
</td></tr>

${counter.cards.length ? `<!-- prize counter -->
<tr><td style="padding:34px 8px 6px;text-align:center">
  <div style="font-family:${DISPLAY};font-size:30px;line-height:1.1;color:${INK}">The prize counter</div>
  <div style="padding-top:6px;font-family:${SANS};font-weight:700;font-size:15px;color:${muted}">${counter.readyCount ? `${counter.readyCount === 1 ? "1 prize is" : `${counter.readyCount} prizes are`} ready for you` : counter.next ? `${fmt(counter.next.pointCost - pts)} more points to your first prize` : "Earn points every visit"}</div>
</td></tr>
<tr><td style="padding:14px 4px 0;text-align:center;font-size:0">${counter.cards.map(card).join("")}</td></tr>
<tr><td style="padding:2px 8px 10px;text-align:center"><a href="${esc(x.rewardsUrl)}" target="_blank" style="font-family:${SANS};font-weight:800;font-size:15px;color:${deep};text-decoration:underline">See all ${counter.total} prizes &rsaquo;</a></td></tr>` : ""}

${quick.length || tel ? `<!-- quick links -->
<tr><td style="padding:18px 8px 6px;text-align:center;font-size:0">
  ${quick.map((q) => `<a href="${esc(q.url)}" target="_blank" style="display:inline-block;margin:0 5px 10px;padding:11px 18px;background:#ffffff;border:2px solid ${tint};border-radius:999px;font-family:${SANS};font-weight:800;font-size:14px;color:${deep};text-decoration:none">${esc(q.label)}</a>`).join("")}
  ${tel ? `<a href="${esc(tel)}" style="display:inline-block;margin:0 5px 10px;padding:11px 18px;background:#ffffff;border:2px solid ${tint};border-radius:999px;font-family:${SANS};font-weight:800;font-size:14px;color:${deep};text-decoration:none">Call ${esc(prettyPhone(x.brand.phone ?? ""))}</a>` : ""}
</td></tr>` : ""}

<!-- footer -->
<tr><td style="padding:16px 24px 30px;text-align:center">
  <div style="font-family:${DISPLAY};font-size:20px;color:${deep}">${esc(x.brand.businessName)}</div>
  <div style="padding-top:10px;font-family:${SANS};font-weight:600;font-size:12px;line-height:1.7;color:${faint}">
    You're getting this because you joined ${esc(possessive(x.brand.businessName))} rewards.${x.brand.address ? `<br>${esc(x.brand.address)}` : ""}<br>
    <a href="${esc(x.unsubscribeUrl)}" target="_blank" style="color:${faint};text-decoration:underline">Unsubscribe from emails</a>
  </div>
</td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    `${x.brand.businessName} rewards: ${name ? `${name}, you` : "You"} have ${fmt(pts)} points. ${barLabel}.`,
    x.headline,
    ...paras,
    x.ctaLabel && x.ctaUrl ? `${x.ctaLabel}: ${x.ctaUrl}` : null,
    x.footnote,
    counter.cards.length ? `The prize counter:\n${counter.cards.map((c) => `  - ${c.name} (${fmt(c.pointCost)} pts)${c.pointCost <= pts ? " READY" : ` ${fmt(c.pointCost - pts)} to go`}`).join("\n")}` : null,
    `Redeem in the app: ${x.rewardsUrl}`,
    ...quick.map((q) => `${q.label}: ${q.url}`),
    x.brand.phone ? `Call: ${prettyPhone(x.brand.phone)}` : null,
    `—\nYou're getting this because you joined ${possessive(x.brand.businessName)} rewards.${x.brand.address ? `\n${x.brand.address}` : ""}\nUnsubscribe: ${x.unsubscribeUrl}`,
  ].filter(Boolean).join("\n\n");
  return { html, text };
}

/**
 * "Get +1000 points" → "Get +1,000 points". The database fills {{points}} / {{bonus}} as bare digits and venue
 * point numbers run into the thousands. Only numbers that are clearly points are touched: after a "+", or
 * followed by "points" / "pts" / "bonus points". Years, prices, phone numbers and prize names stay as they are.
 */
export function commafy(s: string | null | undefined): string {
  const f = (n: string) => Number(n).toLocaleString("en-US");
  return (s ?? "")
    .replace(/\+(\d{4,7})(?![\d.,])/g, (_m, n: string) => `+${f(n)}`)
    .replace(/(^|[^\d.,$+])(\d{4,7})(?=\s+(?:bonus\s+)?(?:points?|pts)\b)/gi, (_m, pre: string, n: string) => pre + f(n));
}

/** The links every venue email carries, from one place so the dispatcher, the test send and the preview agree. */
export function venueLinks(base: (path: string) => string) {
  return {
    rewardsUrl: base("/app/rewards"),
    redeemUrl: (id: string) => base(`/app/rewards?redeem=${encodeURIComponent(id)}`),
    quickLinks: [
      { label: "Book a cage", url: base("/app/book") },
      { label: "My prizes", url: base("/app/rewards") },
    ] as ArcadeQuickLink[],
  };
}
