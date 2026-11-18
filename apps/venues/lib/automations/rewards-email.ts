/**
 * @atlas/core/email/rewards-email — CP-249 · the ONE rewards email every clinic sends.
 *
 * A fixed frame (brand header with the logo, points card with a progress bar,
 * a large photo, an editorial headline, one button, the reward collection in
 * tiers) filled entirely from what the clinic already set up in the app
 * builder: name, logo, brand colour, rewards, point costs and reward photos.
 * The look is a quiet, editorial med spa style: serif headlines, soft tints of
 * the clinic's own colour, hairlines, generous space. Nobody designs an email
 * per clinic; a rose-gold clinic gets a rose email, a sage clinic a sage one.
 *
 * Used by:
 *   - apps/medspa  desk → App builder → Journey → Automations (the preview)
 *   - apps/venues  /api/automations/email-dispatch (the real send), through a
 *     byte-identical copy at apps/venues/lib/automations/rewards-email.ts
 *     (venues doesn't import @atlas/core yet, see packages/README.md).
 *     Change this file, then copy it over: `cp packages/core/src/email/rewards-email.ts apps/venues/lib/automations/rewards-email.ts`
 *
 * Pure function: no React, no fetching, email-client-safe HTML (tables, inline
 * styles, no SVG). The serif is Cormorant Garamond where the mail app loads web
 * fonts (Apple Mail / iOS), Georgia everywhere else. Safe on server and client.
 */

export type RewardsEmailBrand = {
  businessName: string;
  logoUrl: string | null;
  /** Brand hex from the builder. Anything unreadable falls back to Atlas teal. */
  primary: string;
  /** Builder home photo, used when no reward photo fits the hero. */
  heroUrl?: string | null;
  /** Footer line (CAN-SPAM wants a postal address). */
  address?: string | null;
};

export type RewardsEmailReward = { id?: string | null; name: string; pointCost: number; imageUrl: string | null };

export type RewardsEmailInput = {
  brand: RewardsEmailBrand;
  subject: string;
  preheader?: string | null;
  /** Patient's first name; null → "You have N points". */
  firstName: string | null;
  points: number;
  /** Big headline, e.g. "Congrats! You've unlocked a complimentary HydraFacial". */
  headline: string;
  /** Small line under the headline. */
  subline?: string | null;
  /** Optional paragraphs (blank line = new paragraph). */
  body?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Where "Redeem" in the points card goes (the app's rewards screen). */
  rewardsUrl: string;
  /** The clinic's rewards; the collection and the progress bar come from these. */
  rewards: RewardsEmailReward[];
  /** The reward this email is about (unlocked / almost there / expiring): its photo leads. */
  featuredRewardId?: string | null;
  /** Photo override (e.g. the shop item); otherwise featured reward → next reward → brand hero. */
  heroUrl?: string | null;
  footnote?: string | null;
  unsubscribeUrl: string;
};

const FALLBACK = "#2d6a78";
const IVORY = "#fbf8f5";
const INK = "#2b2725";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHex = (h: string | null | undefined) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : FALLBACK);
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Darken a brand colour until it reads on `bg` (pale brand colours like blush pink still give legible text). */
const readable = (c: string, bg: string, min: number) => { let out = c; for (let i = 0; i < 14 && contrast(out, bg) < min; i++) out = mix(out, "#000000", 0.1); return out; };
/** "Complimentary" over a reward name only when it is a free thing ("HydraFacial"), never over "$25 off". */
const isFreeThing = (name: string) => !/(\$|%|\boff\b|\bfree\b|complimentary|\bcredit\b|\bdiscount\b)/i.test(name);
/** "Glow Aesthetics'" / "Lotus Medspa's". */
const possessive = (n: string) => (/s$/i.test(n.trim()) ? `${n.trim()}'` : `${n.trim()}'s`);
const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString("en-US");

const SERIF = "'Cormorant Garamond','Cormorant',Georgia,'Times New Roman',serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/** Up to 3 tiers from the clinic's own point costs. */
export function rewardTiers(rewards: RewardsEmailReward[]) {
  const list = rewards.filter((r) => r.pointCost > 0 && r.name.trim()).sort((a, b) => a.pointCost - b.pointCost);
  const costs = [...new Set(list.map((r) => r.pointCost))];
  let bands: number[][];
  if (costs.length <= 3) bands = costs.map((c) => [c]);
  else {
    const per = Math.ceil(costs.length / 3);
    bands = [costs.slice(0, per), costs.slice(per, per * 2), costs.slice(per * 2)].filter((b) => b.length);
  }
  return bands.map((b) => ({ min: b[0], max: b[b.length - 1], rewards: list.filter((r) => r.pointCost >= b[0] && r.pointCost <= b[b.length - 1]) }));
}

export function renderRewardsEmail(x: RewardsEmailInput): { html: string; text: string } {
  const p = safeHex(x.brand.primary);
  // One palette, all from the clinic's colour.
  const blush = mix(IVORY, p, 0.07);          // soft panels
  const veil = mix(IVORY, p, 0.15);           // progress track, hairlines
  const deep = readable(mix(p, "#000000", 0.12), blush, 4.5); // serif headlines + accents on the soft panels
  const accent = readable(p, "#ffffff", 3);   // button fill (readable white text on it)
  const onAccent = contrast("#ffffff", accent) >= 3 ? "#ffffff" : INK;
  const band = p;                              // header in the true brand colour
  const bandSoft = mix(p, "#ffffff", 0.22);
  const onBand = contrast("#ffffff", band) >= 2.6 ? "#ffffff" : INK;
  const muted = mix(INK, IVORY, 0.48);
  const faint = mix(INK, IVORY, 0.62);

  const tiers = rewardTiers(x.rewards);
  const all = tiers.flatMap((t) => t.rewards);
  const pts = Math.max(0, Math.floor(x.points || 0));

  // progress bar: 0 + each tier's entry cost, evenly spaced, filled piecewise
  const ticks = [0, ...tiers.map((t) => t.min)];
  let fill = 0;
  if (ticks.length > 1) {
    const seg = 1 / (ticks.length - 1);
    for (let i = 1; i < ticks.length; i++) {
      const lo = ticks[i - 1], hi = ticks[i];
      if (pts >= hi) fill = i * seg;
      else { fill = (i - 1) * seg + seg * Math.max(0, (pts - lo) / Math.max(1, hi - lo)); break; }
    }
  }
  const fillPct = Math.round(Math.min(1, fill) * 100);

  const featured = all.find((r) => r.id && r.id === x.featuredRewardId) ?? null;
  const next = all.find((r) => r.pointCost > pts) ?? null;
  const heroUrl = x.heroUrl || featured?.imageUrl || next?.imageUrl || all.find((r) => r.imageUrl)?.imageUrl || x.brand.heroUrl || null;
  const name = x.firstName?.trim();
  const youHave = `${name ? `${name}, you` : "You"} have ${fmt(pts)} point${pts === 1 ? "" : "s"}`;
  const unlockedCount = all.filter((r) => r.pointCost <= pts).length;
  const paras = (x.body ?? "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  const eyebrow = (t: string, color = deep) => `<div style="font-family:${SANS};font-size:11px;line-height:1.4;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:${color}">${esc(t)}</div>`;
  const rule = (w = 36) => `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 0"><tr><td style="width:${w}px;height:1px;line-height:1px;font-size:0;background:${p}">&nbsp;</td></tr></table>`;
  const button = (label: string, url: string, big = false) =>
    `<a href="${esc(url)}" style="display:inline-block;background:${accent};color:${onAccent};text-decoration:none;font-family:${SANS};font-weight:600;letter-spacing:.18em;text-transform:uppercase;font-size:${big ? 13 : 11.5}px;line-height:1;padding:${big ? "18px 40px" : "13px 24px"};border-radius:999px">${esc(label)}</a>`;

  const logo = x.brand.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="background:#ffffff;border-radius:999px;padding:12px 26px"><img src="${esc(x.brand.logoUrl)}" alt="${esc(x.brand.businessName)}" height="40" style="height:40px;max-width:190px;display:block;border:0"></td></tr></table>`
    : `<div style="font-family:${SERIF};font-variant-numeric:lining-nums;font-size:32px;line-height:1.1;font-weight:500;letter-spacing:.06em;color:${onBand}">${esc(x.brand.businessName)}</div>`;

  const tickCells = ticks.map((t, i) => `<td align="${i === 0 ? "left" : i === ticks.length - 1 ? "right" : "center"}" style="font-family:${SANS};font-size:11px;letter-spacing:.06em;color:${pts >= t ? deep : faint};padding-top:8px">${fmt(t)}</td>`).join("");

  const card = (r: RewardsEmailReward, locked: boolean) => `
<div style="display:inline-block;vertical-align:top;width:168px;margin:0 7px 18px;text-align:left">
  <div style="border-radius:16px;overflow:hidden;background:${veil};line-height:0">${r.imageUrl
    ? `<img src="${esc(r.imageUrl)}" alt="" width="168" height="200" style="width:168px;height:200px;object-fit:cover;display:block;border:0;${locked ? "opacity:.45;" : ""}">`
    : `<div style="width:168px;height:200px;background:${veil}"></div>`}</div>
  <div style="padding:12px 2px 0">
    ${locked
      ? `<div style="font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:${faint}">Unlocks at ${fmt(r.pointCost)}</div>`
      : `<div style="font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:${deep}">${isFreeThing(r.name) ? "Complimentary" : "Ready for you"}</div>`}
    <div style="padding-top:5px;font-family:${SERIF};font-variant-numeric:lining-nums;font-size:19px;line-height:1.2;font-weight:600;color:${locked ? muted : INK}">${esc(r.name)}</div>
    <div style="padding-top:4px;font-family:${SANS};font-size:12px;color:${faint}">${fmt(r.pointCost)} points</div>
  </div>
</div>`;

  const tierBlock = (t: (typeof tiers)[number]) => {
    const open = t.min <= pts;
    const range = t.min === t.max ? `${fmt(t.min)} points` : `${fmt(t.min)} – ${fmt(t.max)} points`;
    return `
<tr><td style="padding:0 16px 18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${open ? blush : IVORY};border:1px solid ${veil};border-radius:24px"><tr><td style="padding:26px 11px 8px;text-align:center">
    ${eyebrow(open ? "Yours to enjoy" : "Within reach", open ? deep : faint)}
    <div style="padding:8px 0 20px;font-family:${SERIF};font-variant-numeric:lining-nums;font-size:28px;line-height:1.15;font-weight:500;color:${open ? deep : muted}">${range}</div>
    <div style="text-align:center;font-size:0">${t.rewards.slice(0, 6).map((r) => card(r, r.pointCost > pts)).join("")}</div>
  </td></tr></table>
</td></tr>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(x.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:${SANS};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(x.preheader ?? youHave)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY}"><tr><td align="center" style="padding:20px 8px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

<!-- brand header + points card -->
<tr><td style="padding:0 8px 22px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${veil};border-radius:28px;overflow:hidden">
    <tr><td style="background:${band};background-image:linear-gradient(135deg,${band} 0%,${bandSoft} 100%);border-radius:28px 28px 0 0;padding:34px 20px 30px;text-align:center">
      ${logo}
      <div style="padding-top:14px;font-family:${SANS};font-size:10.5px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:${onBand};opacity:.9">Rewards</div>
    </td></tr>
    <tr><td style="padding:24px 14px 26px;text-align:center;font-size:0">
      <div style="display:inline-block;vertical-align:middle;width:100%;max-width:300px;text-align:left;padding:6px 10px">
        <div style="font-family:${SERIF};font-variant-numeric:lining-nums;font-size:24px;line-height:1.2;font-weight:500;color:${INK};padding-bottom:12px">${esc(youHave)}</div>
        ${ticks.length > 1 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${veil};border-radius:999px;height:6px;line-height:6px;font-size:0">
          <table role="presentation" width="${Math.max(fillPct, 3)}%" cellpadding="0" cellspacing="0"><tr><td style="background:${p};border-radius:999px;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr></table>
        </td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${tickCells}</tr></table>` : ""}
      </div>
      <div style="display:inline-block;vertical-align:middle;width:100%;max-width:200px;padding:12px 4px 4px;text-align:center">${button("Redeem", x.rewardsUrl)}</div>
    </td></tr>
  </table>
</td></tr>

${heroUrl ? `<!-- photo -->
<tr><td style="padding:0 8px"><img src="${esc(heroUrl)}" alt="" width="584" style="width:100%;max-width:584px;height:auto;max-height:440px;object-fit:cover;display:block;border:0;border-radius:28px 28px 0 0"></td></tr>` : ""}

<!-- headline -->
<tr><td style="padding:0 8px 34px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${blush};border-radius:${heroUrl ? "0 0 28px 28px" : "28px"}"><tr><td style="padding:40px 30px 42px;text-align:center">
    ${eyebrow(x.brand.businessName)}
    <h1 style="margin:16px 0 0;font-family:${SERIF};font-variant-numeric:lining-nums;font-size:40px;line-height:1.12;font-weight:500;letter-spacing:-.005em;color:${deep}">${esc(x.headline)}</h1>
    ${rule()}
    ${x.subline ? `<p style="margin:18px 0 0;font-family:${SERIF};font-variant-numeric:lining-nums;font-style:italic;font-size:20px;line-height:1.4;color:${muted}">${esc(x.subline)}</p>` : ""}
    ${paras.map((s) => `<p style="margin:18px auto 0;max-width:440px;font-family:${SANS};font-size:15.5px;line-height:1.7;color:${muted}">${esc(s).replace(/\n/g, "<br>")}</p>`).join("")}
    ${x.ctaLabel && x.ctaUrl ? `<div style="padding-top:28px">${button(x.ctaLabel, x.ctaUrl, true)}</div>` : ""}
    ${x.footnote ? `<p style="margin:20px 0 0;font-family:${SERIF};font-variant-numeric:lining-nums;font-style:italic;font-size:18px;color:${deep}">${esc(x.footnote)}</p>` : ""}
  </td></tr></table>
</td></tr>

${tiers.length ? `<!-- the reward collection -->
<tr><td style="padding:6px 24px 24px;text-align:center">
  ${eyebrow("Your rewards")}
  <div style="padding-top:12px;font-family:${SERIF};font-variant-numeric:lining-nums;font-size:34px;line-height:1.15;font-weight:500;color:${INK}">${unlockedCount ? "Ready to redeem today" : "Something lovely is on its way"}</div>
  <div style="padding-top:10px;font-family:${SERIF};font-variant-numeric:lining-nums;font-style:italic;font-size:19px;color:${muted}">${unlockedCount ? `${unlockedCount === 1 ? "A treat" : "Treats"} waiting for your next visit` : next ? `just ${fmt(next.pointCost - pts)} more points to your first` : "earn points with every visit"}</div>
</td></tr>
${tiers.map(tierBlock).join("")}` : ""}

<!-- footer -->
<tr><td style="padding:22px 28px 30px;text-align:center">
  <div style="font-family:${SERIF};font-variant-numeric:lining-nums;font-size:20px;font-weight:500;letter-spacing:.04em;color:${deep}">${esc(x.brand.businessName)}</div>
  ${rule(24)}
  <div style="padding-top:14px;font-family:${SANS};font-size:11.5px;line-height:1.7;color:${faint}">
    You're receiving this because you joined ${esc(possessive(x.brand.businessName))} rewards.${x.brand.address ? `<br>${esc(x.brand.address)}` : ""}<br>
    <a href="${esc(x.unsubscribeUrl)}" style="color:${faint}">Unsubscribe from emails</a>
  </div>
</td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    `${x.brand.businessName} Rewards: ${youHave}.`,
    x.headline,
    x.subline,
    ...paras,
    x.ctaLabel && x.ctaUrl ? `${x.ctaLabel}: ${x.ctaUrl}` : null,
    x.footnote,
    tiers.length ? tiers.map((t) => `${t.min === t.max ? fmt(t.min) : `${fmt(t.min)}–${fmt(t.max)}`} points${t.min > pts ? " (within reach)" : ""}:\n${t.rewards.map((r) => `  - ${r.name} (${fmt(r.pointCost)} pts)`).join("\n")}`).join("\n\n") : null,
    `Redeem in the app: ${x.rewardsUrl}`,
    `—\nYou're receiving this because you joined ${possessive(x.brand.businessName)} rewards.${x.brand.address ? `\n${x.brand.address}` : ""}\nUnsubscribe: ${x.unsubscribeUrl}`,
  ].filter(Boolean).join("\n\n");
  return { html, text };
}

/**
 * Fill {{var}} / {{var|fallback}} the way the database's wf_render does, for previews.
 * Real sends arrive already rendered.
 */
export function fillEmailVars(s: string | null | undefined, vars: Record<string, string | number | null | undefined>): string {
  return (s ?? "").replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\s*\}\}/g, (_m, k: string, fb?: string) => {
    const v = vars[k];
    if (v != null && String(v) !== "") return String(v);
    if (fb) return fb;
    return k === "first_name" ? "there" : k === "offer_name" ? "a surprise" : "";
  });
}
