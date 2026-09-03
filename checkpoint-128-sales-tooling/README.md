# CP-128 · Instant-demo sharpening for door-to-door (Tier 1)

Three changes, all app-side — **no SQL**. Built for one purpose: less prep, faster demos at the door.

## 1 · The invisible-text bug (fixed)

The Business name input in the Instant Demo modal typed **white on white** (the Field App's dark theme bled into the white modal). Explicit colors now — same fix applied to the batch modal's textarea, which had the identical bug.

## 2 · 14 niches + a universal fallback

`lib/demo-packs.ts` grows from 3 packs to **14**, each with its own rewards, wheel prizes, offer, and streak roadmap copy:

Food & drink · Café & boba · Pizza · Sweets & ice cream · Bakery & donuts · Smoke & vape · Dispensary · Beauty & salon · Barbershop · Nails & lashes · Medspa · Gym & fitness · Retail & boutique · **Any local shop** (the generic fallback)

The generic pack means *no business type ever blocks a demo* — walk into any parking lot. Packs map to the CP-64 image library where a set exists (restaurant, coffee-shop, ice-cream, smoke-shop, dispensary, beauty-salon, medspa); fitness/retail/general build image-less but fully branded (the RPC has been null-safe on images since CP-113). The batch tool's free-text guesser (`guessNiche`) understands all 14 — "pizzeria", "boba", "barber", "crossfit", "dispensary" all land on the right pack.

## 3 · "Find" — Google Places auto-fill

Type the shop's name in the Instant Demo modal and tap **Find**:

- canonical business name filled in,
- the right niche pack auto-selected (mapped from Google's category),
- and when the shop has a website, its **logo pulled automatically** (apple-touch-icon → og:image → favicon), flowing through the normal logo path so colors extract exactly as if the rep snapped a photo.

Uses the rep's GPS as a bias, so "Joe's" finds the Joe's they're standing in front of. Agency-admin gated, same as the Field App.

### Setup (one time, ~5 min)

1. Google Cloud Console → create/select a project → enable **Places API (New)** → enable billing (lookups cost fractions of a cent; a full door-day is pennies).
2. Create an API key, restrict it to Places API (New).
3. Vercel → env var **`GOOGLE_PLACES_API_KEY`** → redeploy.

Without the key everything still works — Find just says auto-fill isn't configured and manual entry carries on.

## Test on your phone

1. Field App → Instant demo → type in the name box — **text is visible**.
2. Tap Find on a real nearby shop → name corrects, type flips, logo + colors appear.
3. Build a demo as "Any local shop" for something weird (a laundromat) → generic pack, fully branded.
4. Batch tool → paste "Rusty's Barbershop" + "SLO Donut Co" → right packs guessed.

## Push

```
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
del ".git\index.lock"
git add .
git commit -m "CP-128: door-to-door tier 1 - visible inputs, 14 demo niches + universal fallback, Google Places auto-fill with logo pull"
git push
```
