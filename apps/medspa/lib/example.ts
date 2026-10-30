/**
 * lib/example.ts — the example med spa clinic (copied from apps/venues CP-213)
 *
 * One fully built clinic (Dr. Jane Preview's practice) used to make a quick
 * med spa mockup look finished: a real treatment menu with prices, a shop,
 * the team, before/after results, rewards, and an automated gift that always
 * shows on Home. Content follows Dermis' patient-app onboarding template;
 * the photos are Dermis-approved and served from /public/medspa-example
 * (no storage upload needed, they ship with the app).
 *
 * Used by:
 *   · Builder → "Load example clinic" (brand-editor, med spa layout)
 *   · Field app → Instant demo, med spa niche ("Fill with example clinic")
 *   · Med spa Home on demo businesses → the example scratch gift
 */
import { DEFAULT_MEDSPA_CONFIG, newId, type MedspaConfig, type MedspaShopItem, type MedspaTreatment } from "@/lib/medspa";

const IMG = "/medspa-example";
export const EXAMPLE_IMG = {
  hero: `${IMG}/hero-glow.jpg`,
  t: (slug: string) => `${IMG}/t-${slug}.jpg`,
  before: (slug: string) => `${IMG}/ba-${slug}-before.jpg`,
  after: (slug: string) => `${IMG}/ba-${slug}-after.jpg`,
};

const $ = (dollars: number) => Math.round(dollars * 100);
const lines = (s: string) => s.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);

type T = Omit<MedspaTreatment, "id"> & { key: string };

const TREATMENTS: T[] = [
  { key: "hydrafacial", name: "HydraFacial", category: "Skin", recall_weeks: 4, duration_minutes: 45, price_cents: $(180), member_price_cents: $(153),
    description: "Deeply cleanses, exfoliates and extracts while infusing nourishing, hydrating serums. One session visibly improves fine lines, firmness and texture, with zero downtime. Signature $180 · Deluxe $240 · Premium $275.",
    aftercare: lines("Avoid direct sun exposure and apply a broad-spectrum SPF 30+ for the next 72 hours. Skip harsh exfoliants and retinoids for two days. No intense, sweaty workouts for two days."),
    image_url: EXAMPLE_IMG.t("hydrafacial"), is_active: true },
  { key: "botox", name: "BOTOX® Cosmetic", category: "Injectables", recall_weeks: 12, duration_minutes: 15, price_cents: $(150), member_price_cents: $(128),
    description: "The #1 FDA-approved treatment to soften frown lines, crow's feet and forehead lines. A quick 10-minute session for a natural, refreshed look with no downtime. 10 units $150 · 20 units $300 · 30 units $600.",
    aftercare: lines("For the next four hours, don't lie down, bend over or rub the treated areas. Avoid strenuous exercise, alcohol and heat for the rest of the day. Results appear over 7–14 days."),
    image_url: EXAMPLE_IMG.t("botox"), is_active: true },
  { key: "juvederm", name: "JUVÉDERM®", category: "Injectables", recall_weeks: 39, duration_minutes: 30, price_cents: $(650), member_price_cents: null,
    description: "Hyaluronic acid fillers that smooth wrinkles, restore volume and sculpt lips, cheeks and smile lines for a natural-looking result. Voluma $800 · Vollure $700 · Ultra $650 (1 mL).",
    aftercare: lines("Don't touch, rub or press the area for 24 hours. Skip intense exercise, saunas and alcohol today. A cold compress helps with swelling. Sleep with your head slightly raised tonight."),
    image_url: EXAMPLE_IMG.t("juvederm"), is_active: true },
  { key: "restylane-lyft", name: "Restylane Lyft", category: "Injectables", recall_weeks: 39, duration_minutes: 30, price_cents: $(900), member_price_cents: null,
    description: "The FDA-approved filler for cheeks, smile lines and hands. Restores lost volume for a subtle, natural lift. 1 syringe $900 · 2 syringes $1,600 · 3 syringes $2,250.",
    aftercare: lines("For 24 hours, don't touch the area and avoid intense exercise, heat and alcohol. Use a cold compress for swelling."),
    image_url: EXAMPLE_IMG.t("restylane-lyft"), is_active: true },
  { key: "morpheus8", name: "Morpheus8", category: "Skin", recall_weeks: 26, duration_minutes: 60, price_cents: $(1200), member_price_cents: $(1080),
    description: "Radiofrequency microneedling for fine lines, acne scars, pores and laxity on the face, neck and body. Firmer, smoother skin that keeps improving for months. 1 session $1,200 · 3 sessions $3,000.",
    aftercare: lines("Mild redness, swelling or tiny micro-lesions for a few days is normal. Keep skin clean and moisturised and wear SPF 30+ daily. No direct sun for a month, and no hot tubs or saunas until healed."),
    image_url: EXAMPLE_IMG.t("morpheus8"), is_active: true },
  { key: "alma-harmony", name: "Alma Harmony Laser Facial", category: "Laser", recall_weeks: 4, duration_minutes: 45, price_cents: $(350), member_price_cents: $(315),
    description: "Non-invasive laser facial for pigmentation, age spots, sun damage, fine lines and acne scars, with little to no downtime. 1 session $350 · 3 sessions $900 · 5 sessions $1,600.",
    aftercare: lines("Mild redness or warmth usually fades within a few hours. Keep skin hydrated and cleanse gently. Wear SPF 30+ daily and avoid direct sun."),
    image_url: EXAMPLE_IMG.t("alma-harmony"), is_active: true },
  { key: "cutera-xeo", name: "Cutera Xeo®", category: "Laser", recall_weeks: 4, duration_minutes: 45, price_cents: $(200), member_price_cents: $(180),
    description: "Laser and IPL platform for vascular lesions, pigmentation, unwanted hair, acne and wrinkles. Suitable for all skin types. 1 session $200 · 4 sessions $750 · 6 sessions $1,375.",
    aftercare: lines("Apply SPF 30+ daily and avoid direct sun. Skip hot tubs and saunas for 1–2 days. Pause retinol and acids for a few days."),
    image_url: EXAMPLE_IMG.t("cutera-xeo"), is_active: true },
  { key: "emface", name: "Emface®", category: "Skin", recall_weeks: 26, duration_minutes: 20, price_cents: $(1000), member_price_cents: null,
    description: "No needles, no downtime. Radiofrequency and HIFES® lift and sculpt the forehead, cheeks, jawline and chin in 20 minutes. 1 session $1,000 · 4 sessions $4,000.",
    aftercare: lines("No downtime, so return to normal activities right away. Mild warmth or pinkness can last a few hours."),
    image_url: EXAMPLE_IMG.t("emface"), is_active: true },
  { key: "sofwave", name: "Sofwave™ Skin Tightening", category: "Skin", recall_weeks: 52, duration_minutes: 45, price_cents: $(2250), member_price_cents: null,
    description: "Ultrasound that rebuilds collagen to lift the brows, neck and under-chin and smooth fine lines. The \"lunchtime\" lift. Lower face & neck $2,250 · Full face $2,750 · Full face & neck $3,500.",
    aftercare: lines("No downtime. Use a gentle moisturiser and SPF 30+ daily. Avoid saunas, hot tubs and aggressive facials for 48 hours."),
    image_url: EXAMPLE_IMG.t("sofwave"), is_active: true },
  { key: "emsculpt-neo", name: "Emsculpt NEO", category: "Body", recall_weeks: 26, duration_minutes: 45, price_cents: $(3000), member_price_cents: null,
    description: "Melts fat with radiofrequency and builds 25% more muscle with electromagnetic energy, in 30 minutes, without surgery or downtime. 4 sessions $3,000 · 6 sessions $4,200 · 8 sessions $5,600.",
    aftercare: lines("No downtime. Go straight back to your routine, exercise included."),
    image_url: EXAMPLE_IMG.t("emsculpt-neo"), is_active: true },
  { key: "coolsculpting", name: "CoolSculpting", category: "Body", recall_weeks: null, duration_minutes: 45, price_cents: $(700), member_price_cents: null,
    description: "FDA-cleared controlled cooling that eliminates stubborn fat for good. No needles, no surgery, no downtime. Chin $700 · Arms $1,200 · Belly $3,200 · All areas $4,400.",
    aftercare: lines("Resume normal activities right away. Massage the area daily for the first week. Stay hydrated; results show over 1–3 months."),
    image_url: EXAMPLE_IMG.t("coolsculpting"), is_active: true },
  { key: "age-spot-removal", name: "Age Spot Removal", category: "Laser", recall_weeks: null, duration_minutes: 45, price_cents: $(250), member_price_cents: null,
    description: "Targets sun damage, spider veins and rosacea for a clearer, more even complexion.",
    aftercare: lines("Avoid sun and wear SPF 30+ on the area daily. No hot tubs, saunas or intense exercise for 24–48 hours. A cold compress soothes redness."),
    image_url: EXAMPLE_IMG.t("age-spot-removal"), is_active: true },
];

/** Before/after pairs: [image slug, treatment key, caption]. */
const GALLERY: [string, string, string][] = [
  ["hydration", "hydrafacial", "Glow after one session"],
  ["cleansing-pores", "hydrafacial", "Pores, 3 sessions"],
  ["crowsfeet", "botox", "Crow's feet, 2 weeks after"],
  ["foreheadlines-botox", "botox", "Forehead lines, 14 days"],
  ["lipfiller", "juvederm", "Lip filler, 1 syringe"],
  ["chinfiller", "juvederm", "Chin & jawline"],
  ["dermalfiller", "restylane-lyft", "Cheek contour"],
  ["pigmentation", "alma-harmony", "Pigmentation, 3 sessions"],
  ["acne", "morpheus8", "Acne scarring, 10 months"],
  ["skintexture", "morpheus8", "Texture & fine lines"],
  ["saggyneck", "sofwave", "Neck tightening"],
  ["bodysculpt", "emsculpt-neo", "Arms, 4 sessions"],
];

type ShopSeed = Omit<MedspaShopItem, "id" | "treatment_id"> & { treatment?: string };
const SHOP: ShopSeed[] = [
  { kind: "package", name: "Emsculpt NEO, 4 sessions", description: "The full series to build muscle and burn fat, about a week apart.", price_cents: $(3000), member_price_cents: null, image_url: EXAMPLE_IMG.t("emsculpt-neo"), treatment: "emsculpt-neo", sessions: 4, amounts: [], pickup_note: "", featured: true, is_active: true },
  { kind: "package", name: "Morpheus8, 3 sessions", description: "The recommended series for texture, scarring and tightening. Save $600.", price_cents: $(3000), member_price_cents: $(2700), image_url: EXAMPLE_IMG.t("morpheus8"), treatment: "morpheus8", sessions: 3, amounts: [], pickup_note: "", featured: true, is_active: true },
  { kind: "package", name: "Alma Harmony, 3 sessions", description: "Clearer, more even skin over three visits. Save $150.", price_cents: $(900), member_price_cents: null, image_url: EXAMPLE_IMG.t("alma-harmony"), treatment: "alma-harmony", sessions: 3, amounts: [], pickup_note: "", featured: false, is_active: true },
  { kind: "package", name: "Cutera Xeo, 4 sessions", description: "A full series for pigmentation, redness or hair reduction.", price_cents: $(750), member_price_cents: null, image_url: EXAMPLE_IMG.t("cutera-xeo"), treatment: "cutera-xeo", sessions: 4, amounts: [], pickup_note: "", featured: false, is_active: true },
  { kind: "product", name: "SkinCeuticals C E Ferulic®", description: "Daytime vitamin C serum (15% L-ascorbic acid, 1% vitamin E, 0.5% ferulic acid). Brighter skin and environmental protection for 72 hours.", price_cents: $(182), member_price_cents: $(164), image_url: EXAMPLE_IMG.t("ce-ferulic"), sessions: null, amounts: [], pickup_note: "Ready at the front desk on your next visit.", featured: true, is_active: true },
  { kind: "product", name: "Alastin Gentle Cleanser", description: "A gentle foaming gel cleanser that removes impurities and calms post-procedure skin. Use twice daily.", price_cents: $(58), member_price_cents: $(52), image_url: EXAMPLE_IMG.t("alastin-cleanser"), sessions: null, amounts: [], pickup_note: "Ready at the front desk on your next visit.", featured: true, is_active: true },
  { kind: "gift_card", name: "Gift card", description: "Good for any treatment or product. Never expires.", price_cents: null, member_price_cents: null, image_url: EXAMPLE_IMG.hero, sessions: null, amounts: [5000, 10000, 25000], pickup_note: "", featured: true, is_active: true },
];

/** Rewards (Dermis template). Created through upsert_reward. */
export const EXAMPLE_REWARDS: { name: string; description: string; reward_type: string; point_cost: number; image_url: string }[] = [
  { name: "$25 off your first purchase", description: "Take $25 off your next in-app purchase. Expires 4 days after you unlock it.", reward_type: "discount", point_cost: 50, image_url: EXAMPLE_IMG.t("ce-ferulic") },
  { name: "15-min Emsculpt trial session", description: "A free Emsculpt NEO trial. Build muscle and burn fat, no downtime.", reward_type: "free_item", point_cost: 180, image_url: EXAMPLE_IMG.t("emsculpt-neo") },
  { name: "15-min CoolSculpting trial", description: "A free CoolSculpting trial session. Freeze away stubborn fat.", reward_type: "free_item", point_cost: 190, image_url: EXAMPLE_IMG.t("coolsculpting") },
  { name: "15% off all HydraFacials", description: "Signature, Deluxe and Premium HydraFacials, 15% off.", reward_type: "discount", point_cost: 200, image_url: EXAMPLE_IMG.t("hydrafacial") },
  { name: "30% off an Alma Harmony laser facial", description: "Your first Alma Harmony session, 30% off.", reward_type: "discount", point_cost: 250, image_url: EXAMPLE_IMG.t("alma-harmony") },
  { name: "Complimentary Alastin Cleanser", description: "A full-size Alastin Gentle Cleanser, on us.", reward_type: "free_item", point_cost: 650, image_url: EXAMPLE_IMG.t("alastin-cleanser") },
];

/** Clinic hours for in-app booking: Mon–Fri 9–6, Sat 10–4, 30-min slots. */
export const EXAMPLE_HOURS = {
  start: "09:00", end: "18:00", slot_minutes: 30, days: [1, 2, 3, 4, 5, 6],
  week: { "1": ["09:00", "18:00"], "2": ["09:00", "18:00"], "3": ["09:00", "18:00"], "4": ["09:00", "19:00"], "5": ["09:00", "18:00"], "6": ["10:00", "16:00"] } as Record<string, [string, string]>,
};

/** Membership (Dermis template). */
export const EXAMPLE_MEMBERSHIP = {
  name: "Prevent & Protect",
  price_cents: 15000,
  image_url: EXAMPLE_IMG.t("alma-harmony"),
  perks: [
    "A Laser or Resurfacing facial every month",
    "$150 a month banked toward any treatment",
    "Member pricing on the whole menu",
    "5% off skincare",
  ],
};

/** The automated gift the example always shows on Home (scratch card). */
export const EXAMPLE_GIFT = {
  title: "Welcome gift",
  description: "Our thank-you for joining. Use it on any treatment or product.",
  rewardName: "$25 off your first purchase",
  imageUrl: EXAMPLE_IMG.t("ce-ferulic"),
};

/** A complete medspa_config for the example clinic (fresh ids every call). */
export function buildExampleMedspaConfig(base?: Partial<MedspaConfig>): MedspaConfig {
  const ids = new Map<string, string>();
  const treatments: MedspaTreatment[] = TREATMENTS.map(({ key, ...t }) => {
    const id = newId("tr"); ids.set(key, id);
    return { ...t, id, booking_url: null };
  });
  const providers = [{
    id: newId("pr"), name: "Dr. Jane Preview", title: "Owner · Medical director",
    bio: "Pursuing her beauty career at 16, Jane attended the Oxford International College of Dermatology. For over three decades she's helped thousands regain confidence.",
    photo_url: null, treatment_ids: [], is_active: true,
  }];
  const gallery = GALLERY.map(([img, tKey, caption]) => ({
    id: newId("ga"), title: TREATMENTS.find((t) => t.key === tKey)?.name ?? "", treatment_id: ids.get(tKey) ?? null,
    before_url: EXAMPLE_IMG.before(img), after_url: EXAMPLE_IMG.after(img), caption, consent: true,
  }));
  const items: MedspaShopItem[] = SHOP.map(({ treatment, ...s }) => ({ ...s, id: newId("sh"), treatment_id: treatment ? ids.get(treatment) ?? null : null }));
  const prev = { ...DEFAULT_MEDSPA_CONFIG, ...(base ?? {}) };
  return {
    ...prev,
    treatments, providers, gallery,
    credits: { enabled: true, monthly_credit_cents: $(150), rollover_months: 2, note: "Credits apply to any treatment on the menu." },
    welcome_note: "Your treatments, aftercare and due dates will show up here after your first visit.",
    shop: { ...prev.shop, enabled: true, pay_mode: prev.shop?.pay_mode ?? "stripe", intro: "Treatment packages, the skincare we use in the room, and gift cards.", items, financing: { klarna: true, affirm: true } },
    booking: { ...prev.booking, phone: prev.booking?.phone || "(805) 555-0142", text: true },
    example: true,
  };
}

