/**
 * CP-64 — Curated shot list for the demo image library.
 *
 * Each industry has three slots matching the builder:
 *   hero   → top-of-app / landing backgrounds (interiors, storefronts, vibe)
 *   reward → loyalty reward + service cards (the thing the customer earns)
 *   offer  → special offers / featured promos (close-ups, results, hype)
 *
 * Every entry is a hand-curated Pexels search: `q` is the query, `n` is how
 * many of the top landscape results to keep, `tags` are extra searchable
 * keywords stored on each image. Counts per category are tuned to land
 * 12+ images each, so there's always variety in the picker.
 *
 * To grow the library:
 *   • more of an industry → bump an `n` or add a query, re-run the seeder
 *   • a new industry      → add a key here (slug-style, e.g. "pet-grooming"),
 *                           re-run the seeder — no SQL migration needed.
 * The seeder is idempotent: re-running only adds photos it hasn't stored yet.
 */

export const MANIFEST = {
  "medspa": {
    label: "Medspa",
    hero: [
      { q: "luxury spa reception interior", n: 3, tags: ["front desk", "lobby"] },
      { q: "spa treatment room massage table", n: 3, tags: ["treatment room"] },
      { q: "modern medical spa interior", n: 2, tags: ["clinic"] },
      { q: "spa candles towels stones", n: 2, tags: ["ambience"] },
      { q: "luxury wellness spa pool", n: 2, tags: ["wellness"] },
    ],
    reward: [
      { q: "facial treatment spa woman", n: 2, tags: ["facial"] },
      { q: "botox cosmetic injection clinic", n: 2, tags: ["botox", "injectable"] },
      { q: "back massage spa therapist", n: 2, tags: ["massage"] },
      { q: "hot stone massage", n: 2, tags: ["massage", "hot stone"] },
      { q: "laser skin treatment face", n: 2, tags: ["laser"] },
      { q: "luxury skincare products bottles", n: 2, tags: ["skincare", "products"] },
    ],
    offer: [
      { q: "glowing skin woman face closeup", n: 2, tags: ["results", "glow"] },
      { q: "cosmetic serum dropper bottle", n: 2, tags: ["serum", "product"] },
      { q: "face mask skincare treatment", n: 2, tags: ["face mask"] },
      { q: "spa manicure hands", n: 2, tags: ["manicure", "nails"] },
      { q: "eyelash extensions closeup", n: 2, tags: ["lashes"] },
      { q: "woman relaxing spa robe", n: 2, tags: ["relax", "self care"] },
    ],
  },

  "beauty-salon": {
    label: "Beauty Salon",
    hero: [
      { q: "hair salon interior chairs mirrors", n: 3, tags: ["salon floor"] },
      { q: "barbershop interior", n: 3, tags: ["barbershop"] },
      { q: "nail salon interior", n: 2, tags: ["nail salon"] },
      { q: "beauty salon reception", n: 2, tags: ["front desk"] },
      { q: "salon styling station tools", n: 2, tags: ["station"] },
    ],
    reward: [
      { q: "hairdresser cutting hair salon", n: 2, tags: ["haircut"] },
      { q: "hair coloring foils salon", n: 2, tags: ["color"] },
      { q: "manicure nail salon", n: 2, tags: ["manicure"] },
      { q: "makeup artist applying makeup", n: 2, tags: ["makeup"] },
      { q: "blow dry hair styling", n: 2, tags: ["blowout"] },
      { q: "barber beard trim", n: 2, tags: ["beard", "barber"] },
    ],
    offer: [
      { q: "nail art colorful closeup", n: 2, tags: ["nail art"] },
      { q: "woman new hairstyle happy", n: 2, tags: ["results"] },
      { q: "hair products shampoo bottles", n: 2, tags: ["products"] },
      { q: "eyebrow shaping beauty", n: 2, tags: ["brows"] },
      { q: "pedicure spa feet", n: 2, tags: ["pedicure"] },
      { q: "hairdresser scissors comb tools", n: 2, tags: ["tools"] },
    ],
  },

  "smoke-shop": {
    label: "Smoke Shop",
    hero: [
      { q: "vape shop interior", n: 3, tags: ["shop floor"] },
      { q: "hookah lounge interior", n: 3, tags: ["hookah lounge"] },
      { q: "cigar shop humidor", n: 2, tags: ["cigar"] },
      { q: "neon sign smoke dark", n: 2, tags: ["neon", "vibe"] },
      { q: "tobacco pipe collection", n: 2, tags: ["pipes"] },
    ],
    reward: [
      { q: "hookah shisha smoke", n: 2, tags: ["hookah"] },
      { q: "vape device mod closeup", n: 2, tags: ["vape"] },
      { q: "cigar closeup ashtray", n: 2, tags: ["cigar"] },
      { q: "glass water pipe", n: 2, tags: ["glass"] },
      { q: "rolling paper tobacco", n: 2, tags: ["rolling"] },
      { q: "lighter flame dark", n: 2, tags: ["lighter"] },
    ],
    offer: [
      { q: "vape cloud smoke trick", n: 2, tags: ["vape", "cloud"] },
      { q: "shisha lounge friends", n: 2, tags: ["lounge", "social"] },
      { q: "cigar whiskey lounge", n: 2, tags: ["cigar", "premium"] },
      { q: "incense smoke swirl dark", n: 3, tags: ["smoke", "moody"] },
      { q: "neon open sign shop window", n: 3, tags: ["neon", "open"] },
    ],
  },

  "dispensary": {
    label: "Dispensary",
    hero: [
      { q: "cannabis dispensary interior", n: 3, tags: ["shop floor"] },
      { q: "cannabis plants indoor grow", n: 3, tags: ["grow room"] },
      { q: "marijuana jars shelf", n: 2, tags: ["jars", "display"] },
      { q: "cannabis leaves green background", n: 2, tags: ["leaves"] },
      { q: "modern retail store counter wood", n: 2, tags: ["counter"] },
    ],
    reward: [
      { q: "cannabis bud macro", n: 3, tags: ["flower"] },
      { q: "marijuana joint closeup", n: 2, tags: ["preroll"] },
      { q: "cbd oil dropper bottle", n: 2, tags: ["oil", "tincture"] },
      { q: "cannabis gummies edibles", n: 2, tags: ["edibles"] },
      { q: "vape pen cannabis", n: 1, tags: ["vape"] },
      { q: "cannabis jar hand", n: 2, tags: ["jar"] },
    ],
    offer: [
      { q: "cannabis oil dropper green", n: 2, tags: ["oil"] },
      { q: "hemp products flat lay", n: 2, tags: ["products"] },
      { q: "marijuana grinder buds", n: 2, tags: ["grinder"] },
      { q: "cannabis leaf macro dew", n: 3, tags: ["leaf", "macro"] },
      { q: "weed nug jar glass", n: 3, tags: ["flower", "jar"] },
    ],
  },

  "coffee-shop": {
    label: "Coffee Shop",
    hero: [
      { q: "coffee shop interior cozy", n: 3, tags: ["interior"] },
      { q: "barista espresso machine cafe", n: 3, tags: ["barista", "counter"] },
      { q: "cafe storefront window", n: 3, tags: ["storefront"] },
      { q: "coffee shop table window light", n: 3, tags: ["ambience"] },
    ],
    reward: [
      { q: "latte art closeup", n: 3, tags: ["latte"] },
      { q: "espresso shot cup", n: 2, tags: ["espresso"] },
      { q: "cappuccino foam cup", n: 2, tags: ["cappuccino"] },
      { q: "iced coffee cold brew glass", n: 2, tags: ["iced", "cold brew"] },
      { q: "croissant coffee table", n: 2, tags: ["pastry"] },
      { q: "coffee beans roasted", n: 1, tags: ["beans"] },
    ],
    offer: [
      { q: "pumpkin spice latte autumn", n: 2, tags: ["seasonal"] },
      { q: "matcha latte green", n: 2, tags: ["matcha"] },
      { q: "coffee pastry bakery display", n: 2, tags: ["bakery"] },
      { q: "coffee to go cup hands", n: 2, tags: ["togo"] },
      { q: "pour over coffee brewing", n: 2, tags: ["pour over"] },
      { q: "frappe whipped cream coffee", n: 2, tags: ["frappe"] },
    ],
  },

  "arcade": {
    label: "Arcade",
    hero: [
      { q: "arcade neon machines dark", n: 3, tags: ["neon", "arcade floor"] },
      { q: "arcade game machines row", n: 3, tags: ["machines"] },
      { q: "bowling alley lanes neon", n: 3, tags: ["bowling"] },
      { q: "game room interior neon lights", n: 3, tags: ["game room"] },
    ],
    reward: [
      { q: "claw machine prizes", n: 2, tags: ["claw machine"] },
      { q: "pinball machine closeup", n: 2, tags: ["pinball"] },
      { q: "air hockey table game", n: 2, tags: ["air hockey"] },
      { q: "plush toys prizes colorful", n: 2, tags: ["prizes"] },
      { q: "arcade joystick buttons closeup", n: 2, tags: ["cabinet"] },
      { q: "video game controller neon", n: 2, tags: ["gaming"] },
    ],
    offer: [
      { q: "friends playing arcade games", n: 2, tags: ["social"] },
      { q: "kids birthday party fun", n: 2, tags: ["party"] },
      { q: "vr headset person playing", n: 2, tags: ["vr"] },
      { q: "racing arcade game seat", n: 2, tags: ["racing"] },
      { q: "pizza slices party food", n: 2, tags: ["food"] },
      { q: "neon game sign dark", n: 2, tags: ["neon"] },
    ],
  },

  "ice-cream": {
    label: "Ice Cream",
    hero: [
      { q: "ice cream shop interior", n: 3, tags: ["shop"] },
      { q: "gelato display case colorful", n: 3, tags: ["display"] },
      { q: "ice cream parlor counter", n: 3, tags: ["counter"] },
      { q: "ice cream truck summer", n: 3, tags: ["truck", "summer"] },
    ],
    reward: [
      { q: "ice cream cone scoops", n: 3, tags: ["cone"] },
      { q: "sundae whipped cream cherry", n: 2, tags: ["sundae"] },
      { q: "milkshake glass straw", n: 2, tags: ["milkshake"] },
      { q: "gelato scoop spatula", n: 2, tags: ["gelato"] },
      { q: "soft serve ice cream swirl", n: 2, tags: ["soft serve"] },
      { q: "banana split dessert", n: 1, tags: ["banana split"] },
    ],
    offer: [
      { q: "ice cream sprinkles colorful closeup", n: 2, tags: ["sprinkles"] },
      { q: "chocolate ice cream melting", n: 2, tags: ["chocolate"] },
      { q: "strawberry ice cream fruit", n: 2, tags: ["strawberry"] },
      { q: "waffle cone ice cream hand", n: 2, tags: ["waffle cone"] },
      { q: "popsicle colorful summer", n: 2, tags: ["popsicle"] },
      { q: "kids eating ice cream happy", n: 2, tags: ["family"] },
    ],
  },

  "restaurant": {
    label: "Restaurant",
    hero: [
      { q: "restaurant interior warm lighting", n: 3, tags: ["dining room"] },
      { q: "restaurant table setting elegant", n: 3, tags: ["table setting"] },
      { q: "chef cooking kitchen flames", n: 3, tags: ["kitchen", "chef"] },
      { q: "restaurant patio outdoor dining", n: 3, tags: ["patio"] },
    ],
    reward: [
      { q: "gourmet burger fries", n: 2, tags: ["burger"] },
      { q: "pizza fresh basil wood fired", n: 2, tags: ["pizza"] },
      { q: "pasta dish plated", n: 2, tags: ["pasta"] },
      { q: "tacos plate mexican food", n: 2, tags: ["tacos"] },
      { q: "sushi platter rolls", n: 2, tags: ["sushi"] },
      { q: "steak dinner plated", n: 2, tags: ["steak"] },
    ],
    offer: [
      { q: "brunch table spread food", n: 2, tags: ["brunch"] },
      { q: "cocktails bar drinks colorful", n: 2, tags: ["drinks", "happy hour"] },
      { q: "dessert plate chocolate cake", n: 2, tags: ["dessert"] },
      { q: "salad bowl fresh healthy", n: 2, tags: ["salad", "healthy"] },
      { q: "bbq grill meat flames", n: 2, tags: ["bbq"] },
      { q: "friends dinner cheers restaurant", n: 2, tags: ["social"] },
    ],
  },
};
