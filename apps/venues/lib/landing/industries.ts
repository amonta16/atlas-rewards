/**
 * Demo brands for the white-label showcase — CP-100.
 * Purely illustrative businesses; nothing here is a real Atlas customer.
 */
export type Industry = {
  id: string;
  label: string;
  name: string;
  tagline: string;
  /** Hex brand colors. */
  primary: string;
  secondary: string;
  /** Light tint used for the app background. */
  tint: string;
  initials: string;
  points: number;
  goal: number;
  reward: string;
  rewardCost: number;
  offer: string;
  offerSub: string;
  referral: string;
  streakLabel: string;
  wheelPrize: string;
};

export const INDUSTRIES: Industry[] = [
  {
    id: "coffee",
    label: "Coffee shop",
    name: "Harbor Roast",
    tagline: "Small-batch espresso",
    primary: "#7c3f1d",
    secondary: "#d9a066",
    tint: "#fbf5ee",
    initials: "HR",
    points: 740,
    goal: 1000,
    reward: "Free drink of your choice",
    rewardCost: 1000,
    offer: "Double points before 9am",
    offerSub: "This week only",
    referral: "Bring a friend → you both get a free pastry",
    streakLabel: "5 visits this week",
    wheelPrize: "+250 pts",
  },
  {
    id: "gym",
    label: "Gym",
    name: "Ironline Fitness",
    tagline: "Strength · Conditioning",
    primary: "#0f172a",
    secondary: "#f97316",
    tint: "#f4f5f7",
    initials: "IF",
    points: 420,
    goal: 600,
    reward: "Free personal-training session",
    rewardCost: 600,
    offer: "Check in 4× this week → free smoothie",
    offerSub: "Streak challenge",
    referral: "Refer a member → a free month for both",
    streakLabel: "12-day check-in streak",
    wheelPrize: "Free shaker bottle",
  },
  {
    id: "salon",
    label: "Salon",
    name: "Lumière Salon",
    tagline: "Hair · Color · Nails",
    primary: "#9d174d",
    secondary: "#f9a8d4",
    tint: "#fdf2f8",
    initials: "LS",
    points: 310,
    goal: 500,
    reward: "Free deep-conditioning treatment",
    rewardCost: 500,
    offer: "Book a color service → 2× points",
    offerSub: "Ends Sunday",
    referral: "Send a friend → $15 credit each",
    streakLabel: "3 visits in a row",
    wheelPrize: "+100 pts",
  },
  {
    id: "restaurant",
    label: "Restaurant",
    name: "Casa Verde",
    tagline: "Modern Mexican kitchen",
    primary: "#14532d",
    secondary: "#facc15",
    tint: "#f3faf4",
    initials: "CV",
    points: 880,
    goal: 1000,
    reward: "Free entrée",
    rewardCost: 1000,
    offer: "Taco Tuesday: triple points",
    offerSub: "Every Tuesday",
    referral: "Bring a friend → free guac for both",
    streakLabel: "4 weeks in a row",
    wheelPrize: "Free dessert",
  },
  {
    id: "medspa",
    label: "Med spa",
    name: "Spa by the Bay",
    tagline: "Aesthetics · Wellness",
    primary: "#0a3d62",
    secondary: "#67e8f9",
    tint: "#eef7fb",
    initials: "SB",
    points: 1250,
    goal: 1500,
    reward: "$50 off any facial",
    rewardCost: 1500,
    offer: "Members: 20% off this month",
    offerSub: "VIP offer",
    referral: "Refer a friend → $25 credit each",
    streakLabel: "Monthly visit streak: 6",
    wheelPrize: "+500 pts",
  },
];
