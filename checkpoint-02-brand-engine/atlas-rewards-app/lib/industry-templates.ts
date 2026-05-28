/**
 * Industry templates — preset bundles of widget_config + point_rules
 * tailored to common small-business types Atlas serves.
 *
 * Applied at business creation time (new-business-modal) or by re-applying
 * from the Brand & widgets tab. Each template overwrites widget_config and
 * point_rules but leaves brand colors / copy / images alone.
 */
import type { WidgetConfig, PointRules } from "@/lib/types/database";

export type IndustryTemplate = {
  value: string;
  label: string;
  blurb: string;
  emoji: string;
  widget_config: WidgetConfig;
  point_rules: PointRules;
  /** Default reservation tags created on apply (booking-enabled templates). */
  default_booking_tags?: Array<{ name: string; duration_minutes: number; color?: string }>;
  /** Default product seeds (shop-enabled templates). */
  default_products?: Array<{ name: string; category?: string; price_cents: number }>;
};

/* ---------- helpers ---------- */
const ALL_OFF: WidgetConfig = {
  points_card: true,
  rewards_store: true,
  referrals: false,
  reviews: false,
  birthdays: false,
  visit_tracker: false,
  booking_cta: false,
  offers: false,
  leaderboard: false,
  push: false,
  sms: false,
  booking: false,
  shop: false,
  shop_pickup: false,
  shop_delivery: false,
  news: false,
};

const BASE_POINTS: PointRules = {
  review: 200,
  referral_referrer: 500,
  referral_referee: 100,
  birthday: 250,
  visit: 50,
  purchase_per_dollar: 1,
  social_follow: 50,
  profile_complete: 100,
  first_visit_bonus: 100,
};

function widgets(overrides: Partial<WidgetConfig>): WidgetConfig {
  return { ...ALL_OFF, ...overrides };
}
function points(overrides: Partial<PointRules>): PointRules {
  return { ...BASE_POINTS, ...overrides };
}

/* ---------- the catalog ---------- */
export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    value: "medspa",
    label: "Medspa / Aesthetics",
    blurb: "Booking-first, big on reviews and referrals. No shop.",
    emoji: "💆",
    widget_config: widgets({
      referrals: true, reviews: true, birthdays: true, booking: true,
      offers: true, push: true, sms: true, news: true,
    }),
    point_rules: points({ review: 300, referral_referrer: 1000, birthday: 500 }),
    default_booking_tags: [
      { name: "Consult (30m)",     duration_minutes: 30 },
      { name: "Botox (45m)",       duration_minutes: 45 },
      { name: "Facial (60m)",      duration_minutes: 60 },
      { name: "Filler (90m)",      duration_minutes: 90 },
    ],
  },
  {
    value: "arcade",
    label: "Arcade / Entertainment",
    blurb: "Bookable lanes/cages + visit-streak rewards. Optional shop for tokens/swag.",
    emoji: "🎮",
    widget_config: widgets({
      visit_tracker: true, booking: true, birthdays: true,
      offers: true, push: true, leaderboard: true, news: true,
    }),
    point_rules: points({ visit: 100, birthday: 500 }),
    default_booking_tags: [
      { name: "Batting cage (30m)",    duration_minutes: 30 },
      { name: "Batting cage (1 hr)",   duration_minutes: 60 },
      { name: "Party room (2 hr)",     duration_minutes: 120 },
    ],
  },
  {
    value: "coffee",
    label: "Coffee shop",
    blurb: "Order-ahead shop with pickup. Big on visit punch-card and offers.",
    emoji: "☕",
    widget_config: widgets({
      visit_tracker: true, offers: true, shop: true, shop_pickup: true,
      birthdays: true, push: true, news: true,
    }),
    point_rules: points({ visit: 25, purchase_per_dollar: 2, birthday: 200 }),
    default_products: [
      { name: "Drip coffee",     category: "Drinks", price_cents: 350 },
      { name: "Latte",           category: "Drinks", price_cents: 550 },
      { name: "Croissant",       category: "Bakery", price_cents: 425 },
    ],
  },
  {
    value: "yogurt",
    label: "Frozen yogurt / Dessert",
    blurb: "Shop with pickup, punch card every visit, birthday bonus.",
    emoji: "🍦",
    widget_config: widgets({
      visit_tracker: true, offers: true, shop: true, shop_pickup: true,
      birthdays: true, push: true, news: true,
    }),
    point_rules: points({ visit: 50, purchase_per_dollar: 2, birthday: 500 }),
    default_products: [
      { name: "Small cup",       category: "Cups",     price_cents: 599 },
      { name: "Medium cup",      category: "Cups",     price_cents: 749 },
      { name: "Large cup",       category: "Cups",     price_cents: 899 },
    ],
  },
  {
    value: "restaurant",
    label: "Restaurant",
    blurb: "Booking for tables + shop with pickup AND delivery. Reviews matter.",
    emoji: "🍽️",
    widget_config: widgets({
      reviews: true, birthdays: true, booking: true,
      shop: true, shop_pickup: true, shop_delivery: true,
      offers: true, push: true, sms: true, news: true,
    }),
    point_rules: points({ review: 300, purchase_per_dollar: 1, birthday: 500 }),
    default_booking_tags: [
      { name: "Table for 2",     duration_minutes: 90 },
      { name: "Table for 4",     duration_minutes: 90 },
      { name: "Private event",   duration_minutes: 180 },
    ],
    default_products: [
      { name: "Daily special",   category: "Entrees", price_cents: 1499 },
    ],
  },
  {
    value: "gym",
    label: "Gym / Fitness",
    blurb: "Visit-driven with referrals. No shop, no booking by default.",
    emoji: "💪",
    widget_config: widgets({
      referrals: true, visit_tracker: true, birthdays: true,
      offers: true, push: true, sms: true, news: true,
    }),
    point_rules: points({ visit: 75, referral_referrer: 1500, birthday: 500 }),
  },
  {
    value: "salon",
    label: "Salon / Barber",
    blurb: "Booking-first, referrals, reviews. No shop.",
    emoji: "💇",
    widget_config: widgets({
      referrals: true, reviews: true, birthdays: true, booking: true,
      offers: true, push: true, sms: true, news: true,
    }),
    point_rules: points({ review: 250, referral_referrer: 750, birthday: 500 }),
    default_booking_tags: [
      { name: "Haircut (45m)",       duration_minutes: 45 },
      { name: "Color (90m)",         duration_minutes: 90 },
      { name: "Beard trim (20m)",    duration_minutes: 20 },
    ],
  },
  {
    value: "dental",
    label: "Dental Office",
    blurb: "Booking + reviews. Quiet brand: no SMS spam, no leaderboard.",
    emoji: "🦷",
    widget_config: widgets({
      reviews: true, birthdays: true, booking: true,
      push: true, news: true,
    }),
    point_rules: points({ review: 500, birthday: 250 }),
    default_booking_tags: [
      { name: "Cleaning (30m)",      duration_minutes: 30 },
      { name: "Cleaning (60m)",      duration_minutes: 60 },
      { name: "Whitening consult",   duration_minutes: 30 },
    ],
  },
  {
    value: "retail",
    label: "Retail Store",
    blurb: "Shop with pickup or delivery, offers, and birthday bonuses.",
    emoji: "🛍️",
    widget_config: widgets({
      offers: true, birthdays: true,
      shop: true, shop_pickup: true, shop_delivery: true,
      push: true, news: true,
    }),
    point_rules: points({ purchase_per_dollar: 2, birthday: 500 }),
  },
  {
    value: "home_service",
    label: "Home Service",
    blurb: "Booking-first, referrals heavy. No shop.",
    emoji: "🛠️",
    widget_config: widgets({
      referrals: true, reviews: true, booking: true,
      offers: true, push: true, sms: true,
    }),
    point_rules: points({ review: 300, referral_referrer: 2000 }),
    default_booking_tags: [
      { name: "Free estimate",       duration_minutes: 30 },
      { name: "Service call (1 hr)", duration_minutes: 60 },
    ],
  },
  {
    value: "other",
    label: "Other / start blank",
    blurb: "Just the basics — points card and rewards. Toggle what you need.",
    emoji: "✨",
    widget_config: widgets({}),
    point_rules: points({}),
  },
];

export function templateByValue(v: string | null | undefined): IndustryTemplate | null {
  if (!v) return null;
  return INDUSTRY_TEMPLATES.find(t => t.value === v) ?? null;
}
