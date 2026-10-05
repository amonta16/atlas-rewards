/**
 * Video testimonials — CP-176.
 *
 * HOW TO ADD THE FLIPPO'S VIDEOS
 *  1. Export each clip vertical (9:16), H.264 MP4, ≤ ~25 MB, 30–60 s.
 *     Big files: upload to Vimeo/YouTube (unlisted) and use `embed` instead.
 *  2. Drop them in public/videos/  (e.g. public/videos/flippos-owner.mp4)
 *     and a poster frame JPG next to it.
 *  3. Fill in `video` (or `embed`), `poster`, `name`, `role` and a one-line
 *     `quote` pulled from what they actually say on camera.
 *  4. Once every card has a real video, set SHOW_TESTIMONIAL_PLACEHOLDERS
 *     to false — cards without a video are then hidden, and the whole
 *     section disappears if none are left.
 *
 * Only use words people really said. No invented quotes.
 */
export type Testimonial = {
  id: string;
  name: string;
  role: string;
  /** One real line from the video. null → placeholder copy while empty. */
  quote: string | null;
  /** Self-hosted MP4 path, e.g. "/videos/flippos-owner.mp4". */
  video: string | null;
  /** Vimeo/YouTube embed URL (used instead of `video` when set). */
  embed: string | null;
  poster: string;
  /** CP-191: the clip's real aspect ratio, e.g. "16 / 9" or "4 / 3". */
  aspect?: string;
};

export const SHOW_TESTIMONIAL_PLACEHOLDERS = true;

/**
 * CP-191: the three Flippo's clips (Vimeo, embed URLs exactly as Vimeo's
 * share code gives them). Chris replaces the earlier 1231622571 embed that
 * wasn't loading. `aspect` is the clip's real shape so the frame never
 * letterboxes: Larry and Mary are 4:3, Chris is 16:9.
 */
export const FLIPPOS_CLIPS = [
  { id: "chris", name: "Chris", embed: "https://player.vimeo.com/video/1232934665?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479", aspect: "16 / 9" },
  { id: "larry", name: "Larry", embed: "https://player.vimeo.com/video/1232932429?badge=0&autopause=0&player_id=0&app_id=58479", aspect: "4 / 3" },
  { id: "mary", name: "Mary", embed: "https://player.vimeo.com/video/1232932692?badge=0&autopause=0&player_id=0&app_id=58479", aspect: "4 / 3" },
] as const;

const FLIPPOS = "Flippo's Arcade & Batting Cage · Morro Bay";

export const TESTIMONIALS: Testimonial[] = FLIPPOS_CLIPS.map((c) => ({
  id: c.id === "chris" ? "flippos-owner" : `flippos-${c.id}`,
  name: c.name,
  role: FLIPPOS,
  quote: null,
  video: null,
  embed: c.embed,
  poster: c.id === "chris" ? "/landing/flippos-install-owner.webp" : "/landing/flippos-install-team.webp",
  aspect: c.aspect,
}));
