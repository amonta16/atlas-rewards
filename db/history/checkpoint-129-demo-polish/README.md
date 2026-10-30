# CP-129 · Demo polish: house design preset, real review links, self-organizing folders

All app-side — **no SQL**. Push and it's live.

## 1 · White text, actually dead this time

Instead of chasing spots one by one, the fix is one class on each modal's card: the dark Field App shell was leaking its text color into the white modals, and now the modal root pins dark text — headers, "Demo is live", batch progress rows, everything inherits correctly forever.

## 2 · The house design preset

Every demo (single or batch) is now built with Andrew's curated look automatically: points card **Shiny**, buttons **Rounded**, offer banner **Gradient**, offer cards **Clean white**, reward cards **Bold outline**, badges **Gradient**, section titles **Sticker**, dividers **None**, CTA glow **None**, streak theme + progress **Match my brand**, streak page **Use app theme** — and a background pattern rotating through **Simple white / Rolling Hills / Diagonal / Low poly**, tinted in the shop's own colors. Edit the preset in one place: `DEMO_DESIGN_PRESET` in `lib/demo-packs.ts`.

## 3 · Google review boost — ON, with the shop's REAL review page

Review boost is enabled on every demo, and when the demo came from **Find** or **Scan** (Google knows the shop), the review link is set to that shop's actual "write a review" page. In the pitch, the review nudge in their demo app opens *their* real Google reviews — very hard to argue with.

## 4 · Demos file themselves: City ▸ Niche

Every demo built with a known address lands in the Apps deck under **"Morro Bay" ▸ "Smoke & vape"**, **"SLO" ▸ "Café & boba"**, etc. — folders created on demand (the CP-128.2 nesting). Scan-built batches carry each shop's address through automatically; hand-typed lines without an address stay in the default demo folder.

## 5 · Fix a wrong niche guess on the spot

The scan checklist now has a per-row niche dropdown — a mixed plaza takes ten seconds to correct before building.

## 6 · Images for "Any local shop" (one manual step)

The generic/fitness/retail packs build image-less because the image library has no photos for them yet. The library now offers three new sets — **General (any shop)**, **Gym & Fitness**, **Retail & Boutique**. Open the admin image library once and upload ~4–6 photos into each (hero + rewards + offer); from then on every "Any" demo comes out with imagery automatically.

## Push

```
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
del ".git\index.lock"
git add .
git commit -m "CP-129: house design preset on demos, real Google review links, city>niche auto-filing, niche re-pick, modal text fix, new library industries"
git push
```

## Test

Build one demo with Find → open it: shiny points card, gradient banner, sticker titles, patterned background in their colors, review section pointing at their real Google page → Apps deck shows it filed under its city ▸ niche.
