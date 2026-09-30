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
};

export const SHOW_TESTIMONIAL_PLACEHOLDERS = true;

/** Flippo's testimonial (Vimeo). Used on all three cards until the other clips are in. */
const FLIPPOS_VIDEO = "https://player.vimeo.com/video/1231622571?dnt=1&title=0&byline=0&portrait=0";

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "flippos-owner",
    name: "Owner",
    role: "Flippo's Arcade & Batting Cage · Morro Bay",
    quote: null,
    video: null,
    embed: FLIPPOS_VIDEO,
    poster: "/landing/flippos-install-owner.webp",
  },
  {
    id: "flippos-desk",
    name: "Front desk",
    role: "Flippo's Arcade & Batting Cage",
    quote: null,
    video: null,
    embed: FLIPPOS_VIDEO,
    poster: "/landing/flippos-install-team.webp",
  },
  {
    id: "flippos-guest",
    name: "Guest",
    role: "Flippo's member",
    quote: null,
    video: null,
    embed: FLIPPOS_VIDEO,
    poster: "/landing/flippos-install-team.webp",
  },
];
