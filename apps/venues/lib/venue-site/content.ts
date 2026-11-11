/**
 * Venue website content — the words, prices and photos for a business's
 * public site at <slug>.<root>/site.
 *
 * Bookable things (cages, pool tables, party room), rewards, logo, brand
 * colors, phone and address come from the database, so the site and the app
 * always show the same thing. What lives here is the marketing copy the
 * database has no column for: the story, the price board, the menu, rules.
 *
 * One entry per business slug. A slug with no entry has no website (404).
 */

export type PriceRow = { price: string; hittrax: string; balls: number; minutes: number };
export type SitePackage = { name: string; price: number; perGuest: string; perks: string[]; popular?: boolean };
export type MenuSection = { title: string; note?: string; soon?: boolean; items: Array<{ name: string; price?: string }> };
export type HoursRow = { label: string; isoDays: number[]; open: string; close: string };

export type VenueSiteContent = {
  /** Short display name used in copy ("Flippo's"). */
  shortName: string;
  city: string;
  seoTitle: string;
  seoDescription: string;
  /** Hours shown on the site (also drive the "Open now" chip). 24h "HH:MM", venue timezone. */
  hours: HoursRow[];
  timezone: string;
  /** External waiver link, used only when the business has no active Atlas waiver (null hides the button). */
  waiverUrl: string | null;
  hero: { eyebrow: string; title: string; sub: string; video: string; poster: string };
  reel: { video: string; poster: string };
  activities: Array<{ id: string; label: string; tag: string; img: string; blurb: string }>;
  cages: {
    title: string; intro: string; body: string;
    facts: Array<{ big: string; small: string }>;
    prices: PriceRow[];
    rules: string[];
    photos: string[];
  };
  arcade: {
    title: string; intro: string;
    games: Array<{ name: string; tag: string; img: string }>;
  };
  parties: {
    title: string; intro: string;
    includes: string[];
    fineprint: string;
    packages: SitePackage[];
    photo: string;
  };
  food: { title: string; intro: string; orderPhone: string; menuImage: string; photos: string[]; sections: MenuSection[] };
  about: { title: string; body: string; points: Array<{ title: string; body: string }>; photo: string };
  app: { title: string; sub: string; video: string; poster: string; qr: string; joinCode: string; features: Array<{ title: string; body: string }> };
};

const F = "/flippos";

export const FLIPPOS: VenueSiteContent = {
  shortName: "Flippo's",
  city: "Morro Bay, CA",
  seoTitle: "Flippo's Morro Bay · Batting Cages, Arcade, Cafe & Beer",
  seoDescription:
    "Batting cages up to 55 MPH, a packed arcade, pool tables, pizza and cold beer in Morro Bay. Book a cage or a party online in seconds.",
  hours: [
    { label: "Mon – Thu", isoDays: [1, 2, 3, 4], open: "10:00", close: "20:00" },
    { label: "Fri – Sat", isoDays: [5, 6], open: "11:00", close: "21:00" },
    { label: "Sunday", isoDays: [7], open: "11:00", close: "19:00" },
  ],
  timezone: "America/Los_Angeles",
  // Flippo's signs waivers in Atlas now (business_waivers); no outside waiver.
  waiverUrl: null,
  hero: {
    eyebrow: "Now open in Morro Bay",
    title: "Eat. Drink. Play!",
    sub: "Batting cages, a packed arcade, pool, pizza and cold beer. Morro Bay's favorite place to play.",
    video: `${F}/hero.mp4`,
    poster: `${F}/hero.jpg`,
  },
  reel: { video: `${F}/reel.mp4`, poster: `${F}/reel.jpg` },
  activities: [
    { id: "cages", label: "Batting Cages", tag: "Hit it big!", img: `${F}/cages-wide.webp`, blurb: "Six cages, up to 55 MPH, HitTrax in Cage #4." },
    { id: "arcade", label: "Arcade", tag: "Level up here!", img: `${F}/arcade-games.webp`, blurb: "Classics, claw cranes, skee-ball, air hockey and the Prize Hub." },
    { id: "parties", label: "Parties", tag: "Celebrate big wins", img: `${F}/family-arcade.webp`, blurb: "Private room, pizza, cages and arcade credits. We do the work." },
  ],
  cages: {
    title: "Train like a pro",
    intro:
      "A safe, exciting place to practice your swing, whether you're just starting out or sharpening up for the season.",
    body:
      "Consistent pitching speeds, spacious lanes and well-kept gear. Kids, teens and adults can all step in: practice, compete with friends, or just have a blast.",
    facts: [
      { big: "6", small: "cages" },
      { big: "55", small: "MPH max" },
      { big: "33", small: "MPH softball" },
      { big: "HitTrax", small: "in Cage #4" },
    ],
    prices: [
      { price: "$1.50", hittrax: "$2", balls: 9, minutes: 1 },
      { price: "$12.50", hittrax: "$15", balls: 90, minutes: 10 },
      { price: "$20", hittrax: "$25", balls: 135, minutes: 15 },
      { price: "$25", hittrax: "$30", balls: 180, minutes: 20 },
      { price: "$30", hittrax: "$45", balls: 270, minutes: 30 },
      { price: "$50", hittrax: "$75", balls: 540, minutes: 60 },
    ],
    rules: [
      "Everyone signs a waiver before entering the cages.",
      "Helmets stay on your head the whole time.",
      "No swinging bats outside the cage.",
      "One hitter in the cage at a time. Stay out of a cage someone else is using.",
      "When you're done, pick up the balls and put them back in the buckets.",
      "Machine out of balls? Call an attendant. Please don't touch the pitching machine.",
    ],
    photos: [`${F}/cages.webp`, `${F}/cage-tap.webp`],
  },
  arcade: {
    title: "Level up here",
    intro:
      "Our game room is packed: classic cabinets, claw cranes, skee-ball, foosball, air hockey and more. Challenge friends, play as a family, or unwind after batting practice.",
    games: [
      { name: "Game machines", tag: "Thrilling arcade adventures", img: `${F}/arcade-games.webp` },
      { name: "Claw crane", tag: "Claw crane fun", img: `${F}/claw.webp` },
      { name: "Prize Hub", tag: "Trade tickets for prizes", img: `${F}/prize-hub.webp` },
      { name: "Skee-ball & sports", tag: "High-energy sports fun", img: `${F}/skeeball.webp` },
      { name: "Shooters & racers", tag: "Grab a friend", img: `${F}/halo.webp` },
      { name: "Hoops & ticket games", tag: "Rack up tickets", img: `${F}/arcade-row.webp` },
    ],
  },
  parties: {
    title: "Big swings. High scores. Zero stress.",
    intro:
      "Birthdays, team parties and special events. Private party space, batting cage action, arcade excitement, great food and cold beer: everything for a party nobody forgets.",
    includes: [
      "2 hours of party time",
      "Up to 8 guests (more welcome)",
      "Private room & pool table",
      "14\" pizza + 1 drink per guest",
      "10% off Flippo's Cafe (alcohol not included)",
    ],
    fineprint: "Outside cake is welcome and decorations are encouraged. We just ask that all decor comes down by the end of your party.",
    packages: [
      { name: "Basic", price: 159, perGuest: "$18", perks: ["2 large pizzas + drinks"] },
      { name: "Grand Slam", price: 249, perGuest: "$25", perks: ["2 cages included", "2 large pizzas + drinks"], popular: true },
      { name: "Level Up", price: 279, perGuest: "$30", perks: ["200 arcade credits per guest", "2 large pizzas + drinks"] },
      { name: "All Star", price: 349, perGuest: "$35", perks: ["2 cages included", "200 arcade credits per guest", "10% off extra cages", "2 large pizzas + drinks"] },
    ],
    photo: `${F}/family-arcade.webp`,
  },
  food: {
    title: "Home Plate cafe",
    intro: "Refuel between rounds. Pizza, hot dogs, pretzels, snacks, cold drinks, and beer on tap for the grown-ups.",
    orderPhone: "8052251099",
    menuImage: `${F}/menu.webp`,
    photos: [`${F}/food.webp`, `${F}/pizza.webp`],
    sections: [
      { title: "Base Bites", items: [{ name: "Cheese Pizza", price: "$11.00" }, { name: "Nachos", price: "$6.00" }, { name: "Hot Dog", price: "$5.50" }] },
      { title: "Make it a Double Play", items: [{ name: "Pepperoni Pizza", price: "$13.00" }, { name: "Chili Cheese Nachos", price: "$9.00" }, { name: "Chili Dog", price: "$8.00" }] },
      { title: "Dippers", note: "Includes 1 dip · extra dip $0.75", items: [{ name: "Fastball Chicken Bites", price: "$7.50" }, { name: "Pre-game Pretzel", price: "$7.00" }, { name: "Spring Training Rolls (2)", price: "$5.50" }, { name: "Batter Up Mozzarella Sticks", price: "Soon" }] },
      { title: "In the Bag", items: [{ name: "In A Pickle", price: "$3.00" }, { name: "Chips", price: "$3.25" }, { name: "Corn Nuts", price: "$2.50" }, { name: "Popcorn", price: "$3.25" }] },
      { title: "Draft Beer", items: [{ name: "Modelo Especial", price: "$6" }, { name: "Coors Light", price: "$6" }, { name: "Allagash White", price: "$8" }, { name: "Lagunitas IPA", price: "$8" }, { name: "Sierra Nevada Hazy IPA", price: "$8" }, { name: "Stone Brewing IPA", price: "$8" }] },
      { title: "Drinks", items: [{ name: "Bottled Soda 20oz", price: "$3.00" }, { name: "Bottled Tea", price: "$3.00" }, { name: "Simply Juice / Lemonade", price: "$3.50" }, { name: "Smart Water", price: "$3.50" }, { name: "Aquafina 20oz", price: "$2.50" }, { name: "Capri Sun", price: "$1.00" }, { name: "Nesquik Choc Milk", price: "$3.50" }, { name: "Calypso", price: "$3.50" }, { name: "Jarritos", price: "$2.00" }, { name: "Arizona Tea", price: "$3.00" }] },
      { title: "The Sweet Spot", soon: true, items: [{ name: "Ice cream" }, { name: "Cookies" }, { name: "Pastries" }] },
      { title: "Super Bowls", soon: true, items: [{ name: "Super Noodle Bowl" }, { name: "Chili Bowl" }] },
    ],
  },
  about: {
    title: "More than batting cages",
    body:
      "Flippo's celebrated its grand reopening on January 23rd, 2026. Sports, games, great food and community energy, all under one roof. Come to train, hang out with family, or just have fun.",
    points: [
      { title: "Safe & family-friendly", body: "Well-kept cages and games built with safety in mind. Little ones love the game room; older kids hit in the cages with proper gear." },
      { title: "Something for everyone", body: "Arcade classics, pool, foosball, air hockey and more. Friendly competition for every age." },
      { title: "Food & refreshments", body: "Coffee, cold drinks, snacks and comfort bites from our cafe, plus beer and wine for adults." },
    ],
    photo: `${F}/storefront.webp`,
  },
  app: {
    title: "Get the Flippo's app",
    sub: "Your cages, your points and your prizes in your pocket. Book in seconds and earn on every visit.",
    video: `${F}/app-promo.mp4`,
    poster: `${F}/app-promo.jpg`,
    qr: `${F}/app-qr.svg`,
    joinCode: "FLIPPOSARCAD",
    features: [
      { title: "Book a cage in seconds", body: "Same bookings as this site: pick a cage, pick a time, done." },
      { title: "Earn points every visit", body: "Scan in at the counter and points stack up automatically." },
      { title: "Spin the prize wheel", body: "Free spins for credits, discounts and surprise prizes." },
      { title: "Turn points into free stuff", body: "Pizza, cage time, pool and arcade credits." },
    ],
  },
};

const SITES: Record<string, VenueSiteContent> = {
  "flippo-s-arcade-and-batting-cage": FLIPPOS,
};

export function siteContentFor(slug: string): VenueSiteContent | null {
  return SITES[slug] ?? null;
}
