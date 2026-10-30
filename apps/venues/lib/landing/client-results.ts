/**
 * Client results band on atlas-engine.app — CP-194.
 *
 * PLACEHOLDER DATA. Every entry with `placeholder: true` is layout filler:
 * the figures are not real results and the med spa names are not clients.
 * While any placeholder is shown, the band prints a "Sample figures" note.
 * Replace with real, permissioned results (proof ledger) before running ads,
 * then set placeholder: false.
 */
export type ClientResult = {
  id: string;
  /** Wordmark text in the logo row. */
  client: string;
  /** How the wordmark is set, so the row reads like a row of real logos. */
  mark: "caps" | "serif" | "light" | "script";
  headline: string;
  image: string;
  /** Focal point for object-position. */
  focus?: string;
  stats: { value: string; label: string }[];
  products: ("Memberships" | "Rewards" | "Branded app" | "Shop" | "Front desk")[];
  placeholder: boolean;
};

export const CLIENT_RESULTS: ClientResult[] = [
  {
    id: "flippos",
    client: "Flippo's",
    mark: "caps",
    headline: "How Flippo's Arcade & Batting Cage brings families back after the first visit",
    image: "/landing/flippos-owner.jpg",
    focus: "45% 35%",
    stats: [{ value: "x2", label: "Return visits per guest" }, { value: "+$18k", label: "Membership revenue added" }],
    products: ["Memberships", "Rewards"],
    placeholder: true,
  },
  {
    id: "coastal",
    client: "Coastal Skin Studio",
    mark: "serif",
    headline: "How Coastal Skin Studio fills its injector calendar on time, every quarter",
    image: "/landing/blue-lines.jpg",
    stats: [{ value: "+31%", label: "Patients rebooked on schedule" }, { value: "142", label: "Active members" }],
    products: ["Memberships", "Branded app"],
    placeholder: true,
  },
  {
    id: "luma",
    client: "Luma Med Spa",
    mark: "light",
    headline: "Why Luma Med Spa moved its membership program into its own app",
    image: "/landing/blue-lines.jpg",
    stats: [{ value: "+$9k", label: "Monthly recurring revenue" }, { value: "4.9", label: "Google rating after reviews push" }],
    products: ["Memberships", "Rewards", "Shop"],
    placeholder: true,
  },
  {
    id: "bayside",
    client: "Bayside Aesthetics",
    mark: "script",
    headline: "How Bayside Aesthetics turned one-time facials into a regular routine",
    image: "/landing/blue-lines.jpg",
    stats: [{ value: "x3", label: "Facials per patient per year" }, { value: "+22%", label: "Retail sold through the app" }],
    products: ["Rewards", "Shop", "Front desk"],
    placeholder: true,
  },
];
