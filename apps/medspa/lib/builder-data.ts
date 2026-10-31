/**
 * What the desk App builder edits: the exact businesses columns the patient
 * app and the desk read (and the old builder wrote), so all three stay in sync.
 */
import { createClient } from "@atlas/core/supabase/server";
import type { Clinic } from "./clinic";

export type BuilderData = {
  name: string;
  logo_url: string | null;
  app_icon_url: string | null;
  hero_image_url: string | null;
  primary: string;
  phone: string;
  address: string;
  google_review_url: string;
  welcome_message: string;
  /** businesses.medspa_config, untouched keys preserved on save. */
  cfg: Record<string, unknown>;
  /** The full brand_colors / contact_info objects, so saving only changes the keys edited here. */
  brandRaw: Record<string, unknown>;
  contactRaw: Record<string, unknown>;
};

export async function getBuilderData(clinic: Clinic): Promise<BuilderData> {
  if (clinic.isExample && clinic.id === "example") {
    return {
      name: clinic.name, logo_url: null, app_icon_url: null, hero_image_url: clinic.heroUrl, primary: clinic.primary,
      phone: clinic.phone ?? "", address: clinic.address ?? "", google_review_url: "", welcome_message: "",
      cfg: { ...(clinic.cfg as unknown as Record<string, unknown>), memberships: clinic.plans },
      brandRaw: { primary: clinic.primary }, contactRaw: {},
    };
  }
  const { data } = await createClient().from("businesses")
    .select("name, logo_url, app_icon_url, hero_image_url, brand_colors, contact_info, google_review_url, welcome_message, medspa_config")
    .eq("id", clinic.id).maybeSingle();
  const b = (data ?? {}) as {
    name?: string; logo_url?: string | null; app_icon_url?: string | null; hero_image_url?: string | null;
    brand_colors?: { primary?: string } | null; contact_info?: { phone?: string; address?: string } | null;
    google_review_url?: string | null; welcome_message?: string | null; medspa_config?: Record<string, unknown> | null;
  };
  return {
    name: b.name ?? clinic.name, logo_url: b.logo_url ?? null, app_icon_url: b.app_icon_url ?? null, hero_image_url: b.hero_image_url ?? null,
    primary: b.brand_colors?.primary ?? clinic.primary, phone: b.contact_info?.phone ?? "", address: b.contact_info?.address ?? "",
    google_review_url: b.google_review_url ?? "", welcome_message: b.welcome_message ?? "", cfg: b.medspa_config ?? {},
    brandRaw: (b.brand_colors ?? {}) as Record<string, unknown>, contactRaw: (b.contact_info ?? {}) as Record<string, unknown>,
  };
}
