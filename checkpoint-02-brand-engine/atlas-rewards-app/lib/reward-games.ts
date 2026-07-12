/**
 * reward-games.ts — CP-68
 *
 * The check-in reward is no longer locked to one animation. Each business
 * picks a game in the brand editor (businesses.reward_game); the reward
 * modal plays that game's choreography. The prize itself is still chosen
 * and awarded SERVER-side (spin_daily_reward) — the game is pure theater.
 *
 * NULL / unknown ids fall back to "slot" (the original slot machine).
 */

export type RewardGameId = "slot" | "wheel" | "boxes";

export const REWARD_GAMES: {
  id: RewardGameId; label: string; emoji: string; hint: string;
  /** Title shown in the modal header + quick-action card. */
  title: string;
  /** CTA copy on the play button. */
  cta: string;
}[] = [
  {
    id: "slot", label: "Slot machine", emoji: "🎰",
    hint: "Three reels lock in the prize (default)",
    title: "Daily Spin", cta: "SPIN!",
  },
  {
    id: "wheel", label: "Prize wheel", emoji: "🎡",
    hint: "A spinning wheel lands on the prize",
    title: "Prize Wheel", cta: "SPIN THE WHEEL!",
  },
  {
    id: "boxes", label: "Mystery boxes", emoji: "🎁",
    hint: "Three gift boxes — one holds the prize",
    title: "Mystery Box", cta: "REVEAL MY GIFT!",
  },
];

export function rewardGame(id: string | null | undefined): RewardGameId {
  return (REWARD_GAMES.find((g) => g.id === id)?.id ?? "slot") as RewardGameId;
}

export function rewardGameMeta(id: string | null | undefined) {
  return REWARD_GAMES.find((g) => g.id === rewardGame(id))!;
}
