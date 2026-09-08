/**
 * lib/social-config.ts — CP-134
 *
 * businesses.social_config: per-platform "follow us" reward settings.
 * Mirrors the Google Review reward — customer follows, taps "I followed",
 * staff verifies in the same queue, points land. Shared by the builder
 * (config), the customer Rewards tab (row + modal), and the desk queue.
 */
import type { Business } from "@/lib/types/database";

export type SocialPlatform = "instagram" | "facebook";
export const SOCIAL_PLATFORMS: SocialPlatform[] = ["instagram", "facebook"];

export type SocialRewardConfig = {
  enabled: boolean;
  /** Profile link the customer is sent to. */
  url: string | null;
  /** Shown as "@flippos" — helps the customer find the right account. */
  handle: string | null;
  points: number;
  title: string | null;
  description: string | null;
  /** Redemption / verification rules shown in the modal. */
  rules: string | null;
  /** Reward-specific fine print (falls back to the business default). */
  fine_print: string | null;
};

export const SOCIAL_META: Record<SocialPlatform, { label: string; verb: string; defaultTitle: string; defaultDescription: string; defaultRules: string; color: string }> = {
  instagram: {
    label: "Instagram",
    verb: "Follow us on Instagram",
    defaultTitle: "Follow us on Instagram",
    defaultDescription: "Tap follow on our Instagram, then come back and tell us — staff will verify and add your points.",
    defaultRules: "One reward per customer. Your follow must still be active when staff verify it. Verification usually happens within a day.",
    color: "#E1306C",
  },
  facebook: {
    label: "Facebook",
    verb: "Follow us on Facebook",
    defaultTitle: "Follow us on Facebook",
    defaultDescription: "Like or follow our Facebook page, then come back and tell us — staff will verify and add your points.",
    defaultRules: "One reward per customer. Your follow must still be active when staff verify it. Verification usually happens within a day.",
    color: "#1877F2",
  },
};

export function emptySocialConfig(): SocialRewardConfig {
  return { enabled: false, url: null, handle: null, points: 100, title: null, description: null, rules: null, fine_print: null };
}

/** Tolerant read of businesses.social_config[platform]. */
export function readSocialConfig(business: Pick<Business, "social_config" | "point_rules">, platform: SocialPlatform): SocialRewardConfig {
  const raw = ((business.social_config ?? {}) as Record<string, Partial<SocialRewardConfig>>)[platform] ?? {};
  const fallbackPts = Number(business.point_rules?.social_follow ?? 0) || 100;
  return {
    enabled: !!raw.enabled,
    url: raw.url ?? null,
    handle: raw.handle ?? null,
    points: Number(raw.points ?? 0) > 0 ? Number(raw.points) : fallbackPts,
    title: raw.title ?? null,
    description: raw.description ?? null,
    rules: raw.rules ?? null,
    fine_print: raw.fine_print ?? null,
  };
}

/** A platform row is shown to customers only when enabled AND it has a link. */
export function socialRewardLive(business: Pick<Business, "social_config" | "point_rules">, platform: SocialPlatform): boolean {
  const c = readSocialConfig(business, platform);
  return c.enabled && !!(c.url ?? "").trim();
}
