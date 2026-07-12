/**
 * reward-games.ts — CP-68, simplified in CP-72.
 *
 * CP-72 (Andrew's call): the check-in reward is the PRIZE WHEEL for every
 * business — the slot machine + mystery boxes options were removed ("spin
 * is suitable for every business"). The picker is gone from the builder;
 * any legacy businesses.reward_game value (slot/boxes) resolves to wheel.
 *
 * The prize itself is still chosen and awarded SERVER-side
 * (spin_daily_reward) — the wheel is pure theater. The wheel's segments
 * mirror the business's real prize pool via mystery_wheel_segments
 * (cp72 SQL), and odds are configured per-prize on the builder's Rewards
 * tab (MysteryPoolManager).
 */

export type RewardGameId = "wheel";

export const REWARD_GAMES: {
  id: RewardGameId; label: string; hint: string;
  /** Title shown in the modal header + quick-action card. */
  title: string;
  /** CTA copy on the play button. */
  cta: string;
}[] = [
  {
    id: "wheel", label: "Prize wheel",
    hint: "A spinning wheel lands on the prize",
    title: "Prize Wheel", cta: "SPIN THE WHEEL!",
  },
];

export function rewardGame(_id: string | null | undefined): RewardGameId {
  // CP-72: every business plays the wheel, whatever the column says.
  return "wheel";
}

export function rewardGameMeta(_id: string | null | undefined) {
  return REWARD_GAMES[0];
}
