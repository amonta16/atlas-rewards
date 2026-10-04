/**
 * Med spa demo data — CP-182. Powers the tap-through phone and the quiz on
 * /medspa. A fictional practice ("Your Med Spa"): no real clinic's data.
 * Photos are from our own image library (Pexels, stored in Supabase).
 */
import type { LiveBrand, LiveCategory, LiveReward } from "./live-app-data";

const S = "https://gqmjpntzupnmjooszvcd.supabase.co/storage/v1/object/public";
const M = `${S}/image-library/medspa`;

export const MEDSPA_LIB = {
  hero1: `${M}/hero/pexels-7195806.jpg`,
  hero2: `${M}/hero/pexels-6628475.jpg`,
  hero3: `${M}/hero/pexels-3881073.jpg`,
  hero4: `${M}/hero/pexels-5619463.jpg`,
  hero5: `${M}/hero/pexels-7222170.jpg`,
  hero6: `${M}/hero/pexels-9146378.jpg`,
  offer1: `${M}/offer/pexels-3762402.jpg`,
  offer2: `${M}/offer/pexels-5938230.jpg`,
  offer3: `${M}/offer/pexels-7321710.jpg`,
  offer4: `${M}/offer/pexels-8406612.jpg`,
  reward1: `${M}/reward/pexels-3985361.jpg`,
  reward2: `${M}/reward/pexels-4586708.jpg`,
  reward3: `${M}/reward/pexels-6628601.jpg`,
  reward4: `${M}/reward/pexels-7581577.jpg`,
};

export const MEDSPA_BRAND: LiveBrand = {
  name: "Luma Aesthetics",
  logoUrl: null,
  primary: "#9f6b53",
  secondary: "#e6c3a6",
  accent: "#5b3a2c",
  heroUrl: MEDSPA_LIB.hero1,
};

export const MEDSPA_BOOKING: LiveCategory[] = [
  {
    id: "injectables",
    label: "Injectables",
    unit: "treatment",
    resources: [
      { id: "m1", name: "Neurotoxin (Botox, Dysport)", note: "Every 3–4 months", img: MEDSPA_LIB.offer1, minutes: 30 },
      { id: "m2", name: "Dermal filler", note: "Consult included", img: MEDSPA_LIB.offer2, minutes: 45 },
    ],
  },
  {
    id: "skin",
    label: "Skin",
    unit: "treatment",
    resources: [
      { id: "m3", name: "HydraFacial", img: MEDSPA_LIB.offer3, minutes: 60 },
      { id: "m4", name: "Microneedling", img: MEDSPA_LIB.offer4, minutes: 60 },
    ],
  },
];

export const MEDSPA_REWARDS: LiveReward[] = [
  { id: "r1", name: "$25 off any facial", cost: 500, img: MEDSPA_LIB.reward1 },
  { id: "r2", name: "Free LED add-on", cost: 750, img: MEDSPA_LIB.reward2 },
  { id: "r3", name: "Free lip hydration", cost: 900, img: MEDSPA_LIB.reward3 },
  { id: "r4", name: "Complimentary skin consult", cost: 1200, img: MEDSPA_LIB.reward4 },
];

export const MEDSPA_HOURS: Record<number, [number, number]> = {
  1: [9, 18], 2: [9, 18], 3: [9, 19], 4: [9, 19], 5: [9, 18], 6: [10, 16], 7: [10, 15],
};

export const MEDSPA_OFFER = { title: "Glow Week", sub: "Free LED with any facial", daysLeft: 4, kicker: "This week" };
export const MEDSPA_MEMBER_NOTE = "Monthly memberships and banked treatment credits live here too.";

/** Practice types the quiz offers (question 1). */
export type PracticeTypeId = "medspa" | "injector" | "skin" | "laser" | "wellness" | "derm";
export const PRACTICE_TYPES: Array<{ id: PracticeTypeId; label: string; hero: string; industry: string }> = [
  { id: "medspa", label: "Med spa", hero: MEDSPA_LIB.hero1, industry: "Med spa" },
  { id: "injector", label: "Injector studio", hero: MEDSPA_LIB.hero2, industry: "Med spa" },
  { id: "skin", label: "Skin & facial clinic", hero: MEDSPA_LIB.hero3, industry: "Med spa" },
  { id: "laser", label: "Laser & body", hero: MEDSPA_LIB.hero4, industry: "Med spa" },
  { id: "wellness", label: "Wellness & IV", hero: MEDSPA_LIB.hero5, industry: "Med spa" },
  { id: "derm", label: "Aesthetic dermatology", hero: MEDSPA_LIB.hero6, industry: "Med spa" },
];
