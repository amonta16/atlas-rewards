// Types for our domain. We'll auto-generate these from Supabase in a later checkpoint
// using `supabase gen types`, but hand-typing the core entities now keeps CP 2 self-contained.

export type BrandColors = {
  primary: string;
  secondary: string;
  accent: string;
};

export type WidgetConfig = {
  // Loyalty
  points_card: boolean;
  rewards_store: boolean;
  visit_tracker: boolean;
  leaderboard: boolean;
  // Engagement
  referrals: boolean;
  reviews: boolean;
  birthdays: boolean;
  offers: boolean;
  news: boolean;
  // Commerce
  shop: boolean;
  shop_pickup: boolean;
  shop_delivery: boolean;
  booking: boolean;
  booking_cta: boolean; // legacy "show booking button on Home" flag — kept for back-compat
  // Communication
  push: boolean;
  sms: boolean;
};

export type PointRules = {
  review: number;
  referral_referrer: number;
  referral_referee: number;
  birthday: number;
  visit: number;
  purchase_per_dollar: number;
  social_follow: number;
  profile_complete: number;
  first_visit_bonus: number;
};

export type Tier = {
  name: string;
  /** Legacy points-based qualification — retained for backwards compat with seeded data.
   *  New tier model treats every tier as a paid plan (see `monthly_price_cents`). */
  min_points: number;
  perks: string[];
  /** Marketing copy shown under the tier name on the Rewards tab. */
  description?: string;
  /** Monthly subscription price for this tier. null = free / not purchasable. */
  monthly_price_cents?: number | null;
  /** Points awarded per $1 spent for members on this tier. Overrides the
   *  global purchase_per_dollar rule when set. */
  points_per_dollar?: number | null;
};

export type Service = { name: string; category?: string; price_cents?: number };

export type ContactInfo = {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  /** Background art for the loyalty card on the customer Rewards tab. */
  membership_image_url: string | null;
  /** Booking hours config (when widget_config.booking is on). */
  booking_hours?: BookingHours;
  brand_colors: BrandColors;
  welcome_message: string | null;
  contact_info: ContactInfo;
  google_review_url: string | null;
  widget_config: WidgetConfig;
  point_rules: PointRules;
  tiers: Tier[];
  services: Service[];
  status: "active" | "paused" | "archived";
  /** GHL Calendar integration (per sub-account). When set, the booking
   *  flow uses GHL's free-slots API for availability instead of our local
   *  available_booking_slots RPC. */
  ghl_location_id?: string | null;
  ghl_calendar_id?: string | null;
  ghl_api_key?: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsPost = {
  id: string;
  business_id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  is_published: boolean;
  published_at: string;
};

export type BookingTag = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  duration_minutes: number;
  price_cents: number | null;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  /** Hero image shown on the tile in the customer Book tab. */
  image_url: string | null;
};

export type Booking = {
  id: string;
  business_id: string;
  membership_id: string | null;
  user_id: string | null;
  tag_id: string | null;
  tag_name: string;
  duration_minutes: number;
  scheduled_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  cancelled_reason: string | null;
};

export type BookingHours = {
  start: string;        // "09:00"
  end: string;          // "19:00"
  slot_minutes: number; // 15
  days: number[];       // ISO weekday numbers 1=Mon..7=Sun
};

export type Membership = {
  id: string;
  points_balance: number;
  tier: string;
  lifetime_points_earned: number;
  visit_count: number;
  last_visit_at: string | null;
  joined_at: string;
  referral_code: string | null;
  status: "active" | "dormant" | "blocked";
};

export const INDUSTRY_PRESETS = [
  { value: "medspa",      label: "Medspa / Aesthetics" },
  { value: "salon",       label: "Salon / Barber" },
  { value: "gym",         label: "Gym / Fitness" },
  { value: "restaurant",  label: "Restaurant / Cafe" },
  { value: "arcade",      label: "Arcade / Entertainment" },
  { value: "dental",      label: "Dental Office" },
  { value: "home_service", label: "Home Service" },
  { value: "retail",      label: "Retail Store" },
  { value: "other",       label: "Other" },
] as const;
