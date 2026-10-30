/**
 * The clinic a patient is looking at, in one request-memoized lookup.
 *
 * Real clinics come from `businesses` (layout_preset = "medspa"). The slug
 * "demo" is the built-in example clinic: no database, used for sales demos
 * and for developing the app without Supabase keys.
 */
import { cache } from "react";
import { createClient } from "@atlas/core/supabase/server";
import { readMembership, type MembershipRow, type MembershipView } from "@atlas/core/membership";
import { readMedspaConfig, type MedspaConfig } from "./medspa";
import { buildExampleMedspaConfig, EXAMPLE_IMG, EXAMPLE_REWARDS } from "./example";
import { examplePlans, readPlans, type MedspaPlan } from "./plans";

export const DEMO_SLUG = "demo";

export type ClinicReward = {
  id: string; name: string; description: string | null; reward_type: string;
  point_cost: number; image_url: string | null; terms?: string | null;
};

export type Clinic = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  /** Square home-screen icon (businesses.app_icon_url), falls back to the logo. */
  appIconUrl: string | null;
  heroUrl: string | null;
  /** Brand accent as hex and as "r g b" for Tailwind's rgb(var(--p-rgb)). */
  primary: string;
  primaryRgb: string;
  phone: string | null;
  address: string | null;
  joinCode: string | null;
  cfg: MedspaConfig;
  plans: MedspaPlan[];
  rewards: ClinicReward[];
  membership: MembershipView | null;
  isExample: boolean;
};

type BusinessRow = {
  id: string; slug: string; name: string; logo_url: string | null; hero_image_url: string | null;
  brand_colors: { primary?: string } | null; contact_info: { phone?: string; address?: string } | null;
  medspa_config: unknown; layout_preset: string | null; is_demo: boolean | null; join_code: string | null;
  membership_image_url: string | null; status: string | null; app_icon_url: string | null;
};

const COLUMNS = "id, slug, name, logo_url, hero_image_url, brand_colors, contact_info, medspa_config, layout_preset, is_demo, join_code, membership_image_url, status, app_icon_url";

export const getClinic = cache(async (slug: string): Promise<Clinic | null> => {
  const clean = slug.toLowerCase();
  if (clean === DEMO_SLUG) return exampleClinic();

  const supabase = createClient();
  const { data, error } = await supabase.from("businesses").select(COLUMNS).eq("slug", clean).maybeSingle();
  if (error) throw new Error(`clinic lookup failed: ${error.message}`);
  const b = data as BusinessRow | null;
  if (!b || b.layout_preset !== "medspa" || b.status === "archived") return null;

  const [billing, rewards] = await Promise.all([
    supabase.rpc("membership_billing_public", { p_business_id: b.id }),
    supabase.from("rewards").select("id, name, description, reward_type, point_cost, image_url, terms")
      .eq("business_id", b.id).eq("is_active", true).eq("show_in_store", true).order("point_cost", { ascending: true }),
  ]);
  const row = ((Array.isArray(billing.data) ? billing.data[0] : billing.data) ?? null) as MembershipRow;
  const membership = row ? readMembership(row) : null;
  const cfg = readMedspaConfig(b.medspa_config);
  const primary = b.brand_colors?.primary || "#1E5BD8";
  return {
    id: b.id, slug: b.slug, name: b.name, logoUrl: b.logo_url, appIconUrl: b.app_icon_url ?? b.logo_url, heroUrl: b.hero_image_url,
    primary, primaryRgb: hexToRgb(primary),
    phone: b.contact_info?.phone ?? null, address: b.contact_info?.address ?? null, joinCode: b.join_code,
    cfg, membership,
    plans: readPlans(cfg, membership, (row as { image_url?: string | null } | null)?.image_url ?? b.membership_image_url),
    rewards: (rewards.data ?? []) as ClinicReward[],
    isExample: !!cfg.example,
  };
});

function exampleClinic(): Clinic {
  const cfg = buildExampleMedspaConfig();
  // Stable ids so links survive a reload (buildExample makes fresh random ones).
  cfg.treatments = cfg.treatments.map((t, i) => ({ ...t, id: `tr_${i}` }));
  cfg.shop.items = cfg.shop.items.map((s, i) => ({ ...s, id: `sh_${i}`, treatment_id: null }));
  const primary = "#1E5BD8";
  return {
    id: "example", slug: DEMO_SLUG, name: "Glow Aesthetics", logoUrl: null, appIconUrl: null, heroUrl: EXAMPLE_IMG.hero,
    primary, primaryRgb: hexToRgb(primary), phone: "(805) 555-0142", address: "1200 Marsh St, San Luis Obispo, CA",
    joinCode: "GLOW", cfg, plans: examplePlans(cfg.treatments),
    rewards: EXAMPLE_REWARDS.map((r, i) => ({ ...r, id: `rw_${i}`, terms: null })),
    membership: null, isExample: true,
  };
}

export function hexToRgb(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return "30 91 216";
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

export function treatmentById(c: Clinic, id: string) {
  return c.cfg.treatments.find((t) => t.id === id && t.is_active) ?? null;
}

export function activeTreatments(c: Clinic) {
  return c.cfg.treatments.filter((t) => t.is_active);
}
