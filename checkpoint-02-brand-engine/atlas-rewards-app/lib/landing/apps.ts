/**
 * Real Atlas app mockups — CP-104.
 * Actual home screens of apps built on Atlas, exported as transparent-PNG
 * phone mockups (public/landing/apps/*.webp). Two angles per app:
 *   upright — hero slideshow (straight-on, reads best small + on phones)
 *   tilt    — showcase section (3/4 angle for depth)
 * To add an app: drop <id>-upright.webp + <id>-tilt.webp in the folder and
 * add an entry here — hero + showcase both pick it up.
 */
export type AppMockup = {
  id: string;
  name: string;
  label: string;
  /** Dominant brand color (used for slideshow dots + glows). */
  color: string;
  upright: string;
  tilt: string;
  alt: string;
  offer: string;
  points: string;
};

export const APP_MOCKUPS: AppMockup[] = [
  {
    id: "area51",
    name: "Area 51 Smoke Shop",
    label: "Smoke shop",
    color: "#34c759",
    upright: "/landing/apps/area51-upright.webp",
    tilt: "/landing/apps/area51-tilt.webp",
    alt: "Area 51 Smoke Shop rewards app on an iPhone — green-branded home screen with a mix-and-match offer and top rewards",
    offer: "Mix & Match any 3 for 10% off",
    points: "$1 spent = points toward free products",
  },
  {
    id: "reveal",
    name: "Reveal Medical Aesthetics",
    label: "Med spa",
    color: "#b3403a",
    upright: "/landing/apps/reveal-upright.webp",
    tilt: "/landing/apps/reveal-tilt.webp",
    alt: "Reveal Medical Aesthetics rewards app on an iPhone — red-branded home screen with a body sculpting offer",
    offer: "10% off body sculpting",
    points: "Points on every treatment",
  },
  {
    id: "flippos",
    name: "Flippo's Arcade & Batting Cage",
    label: "Arcade",
    color: "#38a8e8",
    upright: "/landing/apps/flippos-upright.webp",
    tilt: "/landing/apps/flippos-tilt.webp",
    alt: "Flippo's Arcade and Batting Cage rewards app on an iPhone — blue-branded home screen with a happy hour offer",
    offer: "Happy Hour Tuesday: 10% off cages",
    points: "910 pts banked toward free play",
  },
  {
    id: "spa",
    name: "Spa by the Bay",
    label: "Day spa",
    color: "#4a8fa5",
    upright: "/landing/apps/spa-upright.webp",
    tilt: "/landing/apps/spa-tilt.webp",
    alt: "Spa by the Bay rewards app on an iPhone — teal-branded home screen with a first treatment offer",
    offer: "$20 off first treatment",
    points: "8,050 pts toward free services",
  },
];
