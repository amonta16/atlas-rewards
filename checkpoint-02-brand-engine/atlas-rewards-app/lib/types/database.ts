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
  // CP-52.6: location/map + Call-now card at the bottom of the customer home.
  location?: boolean;
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
  /** CP-52.6: Google Maps link for the home-page location card. */
  map_url?: string;
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
  /** CP-52: faint background pattern for the customer app. See lib/patterns.ts
   *  PatternId for the full set (none/gradient/dots/swirls/circles/waves/… ). */
  background_pattern?: string | null;
  /** CP-57: pattern tint (default = brand primary when null). */
  pattern_color?: string | null;
  /** CP-54: customizable header + page colors (default white-ish when null).
   *  Content cards stay white; on-bg text auto-contrasts. */
  header_color?: string | null;
  surface_color?: string | null;
  /** CP-56: sticky featured-offer banner style. See lib/banner-styles.ts
   *  (stripes/brand/gradient/confetti/christmas/halloween/…). */
  banner_style?: string | null;
  /** CP-58: card look (corners + shadow + outline). See lib/design-styles.ts
   *  CardStyleId (rounded/soft/sharp/elevated/outlined). NULL = default. */
  card_style?: string | null;
  /** CP-58: button shape for every customer-app CTA. See lib/design-styles.ts
   *  ButtonStyleId (rounded/pill/soft/square). NULL = default. */
  button_style?: string | null;
  /** CP-65: streak surface theme. See lib/streak-themes.ts StreakThemeId
   *  (fire/gold/neon/pink/blue/gray/coffee/midnight/brand). NULL = fire. */
  streak_theme?: string | null;
  /** CP-65.1: customer offer-card style. See lib/offer-card-styles.ts
   *  (clean/tint/pop/gradient/midnight/luxe). NULL = clean white. */
  offer_card_style?: string | null;
  /** CP-66: rewards store layout. See lib/section-layouts.ts
   *  (grid/list/carousel/spotlight). NULL = grid. */
  rewards_layout?: string | null;
  /** CP-66: limited-offers layout. See lib/section-layouts.ts
   *  (stack/coupon/carousel/billboard). NULL = stack. */
  offers_layout?: string | null;
  /** CP-67: element pack. See lib/element-styles.ts. All NULL = defaults. */
  badge_style?: string | null;    // gradient/solid/outline/dark/glow
  heading_style?: string | null;  // plain/bar/underline/sticker
  divider_style?: string | null;  // none/line/dots/sparkle
  cta_glow?: string | null;       // none/soft/bold
  /** CP-68: check-in reward game (lib/reward-games.ts). NULL = slot. */
  reward_game?: string | null;    // slot/wheel/boxes
  /** CP-68: demo app — reward game replayable (no check-in/cooldown gates). */
  is_demo?: boolean | null;
  /** CP-59: admin-portal folder name for grouping in the agency dashboard.
   *  NULL = Unfiled. Manual grouping only; by-industry view needs no column.
   *  CP-60 superseded by folder_id (kept for backfill only). */
  folder?: string | null;
  /** CP-60: FK into business_folders — the folder this app lives in. NULL = Unfiled. */
  folder_id?: string | null;
  status: "active" | "paused" | "archived";
  /** GHL Calendar integration (per sub-account). When set, the booking
   *  flow uses GHL's free-slots API for availability instead of our local
   *  available_booking_slots RPC. */
  ghl_location_id?: string | null;
  ghl_calendar_id?: string | null;
  ghl_api_key?: string | null;
  /** CP-63 (Admin Field App): the rep who claimed this deal for commission. */
  claimed_by?: string | null;
  claimed_at?: string | null;
  /** Agreed monthly recurring revenue for this deal, in cents (rep commission base). */
  deal_mrr_cents?: number | null;
  /** Per-deal commission override %. NULL = use admin_app_config default. */
  commission_pct?: number | null;
  /** Pitch day (for the field launcher's day sorting). */
  pitch_date?: string | null;
  /** Sales stage for the field app. */
  deal_stage?: "demo" | "pitched" | "won" | "lost";
  created_at: string;
  updated_at: string;
};

/** CP-63: one app as seen in the mobile Field App launcher (list_field_apps RPC). */
export type FieldApp = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  hero_image_url: string | null;
  brand_colors: BrandColors;
  status: string;
  folder_id: string | null;
  folder_name: string | null;
  pitch_date: string | null;
  deal_stage: "demo" | "pitched" | "won" | "lost";
  deal_mrr_cents: number | null;
  commission_pct: number | null;
  monthly_commission_cents: number;
  claimed_by: string | null;
  claimed_by_email: string | null;
  claimed_by_name: string | null;
  is_mine: boolean;
};

/** CP-63: the caller's commission summary (my_rep_earnings RPC). */
export type RepEarnings = {
  monthly_commission_cents: number;
  pipeline_commission_cents: number;
  won_count: number;
  claimed_count: number;
};

/** CP-63.1: a leaderboard row (rep_leaderboard RPC v2). */
export type RepLeaderRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  apps_created: number;
  apps_sold: number;
  claimed_count: number;
  sold_mrr_cents: number;
  monthly_commission_cents: number;
};

/** CP-63.1: the whole team's numbers (team_mrr_summary RPC). */
export type TeamMrrSummary = {
  team_mrr_cents: number;
  team_commission_cents: number;
  apps_created: number;
  apps_sold: number;
  active_reps: number;
};

/** CP-60: an agency-level folder that groups app sub-accounts in the Apps
 *  command deck. Has a name and an optional cover image. */
export type BusinessFolder = {
  id: string;
  name: string;
  cover_image_url: string | null;
  sort: number;
  created_at?: string;
  updated_at?: string;
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
