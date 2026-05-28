# Automated-offer holiday images

Drop themed gift-box illustrations here. The agency dashboard
(`AutomatedOffersManager`) picks them up automatically by slug — no
DB write needed, no config to change.

## Naming convention

One file per occasion, named after the template slug with `_` → `-`:

| Filename                 | Template (DB slug)  | Trigger                       |
|--------------------------|---------------------|-------------------------------|
| `birthday.png`           | `birthday`          | Per-customer birthday         |
| `client-anniversary.png` | `anniversary`       | Per-customer signup anniversary |
| `welcome.png`            | `welcome`           | On signup                     |
| `comeback.png`           | `comeback`          | After 14+ days inactive       |
| `halloween.png`          | `halloween`         | Oct 31 ±7 days                |
| `valentines.png`         | `valentines`        | Feb 14 ±3 days                |
| `new-years.png`          | `new_years`         | Jan 1  ±7 days                |
| `easter.png`             | `easter`            | Apr 1  ±14 days               |
| `black-friday.png`       | `black_friday`      | Nov 29 ±4 days                |
| `christmas.png`          | `christmas`         | Dec 25 ±10 days               |
| `st-patricks.png`        | `st_patricks`       | Mar 17 ±3 days                |
| `summer-kickoff.png`     | `summer_kickoff`    | Jun 21 ±10 days               |

## Aspect ratio + size

- **Aspect**: 4:3 or 3:2 works best. The list thumb crops to ~64×48,
  the edit-panel thumb to ~80×64. The customer-side featured banner
  uses a wide 16:9 crop, so leave breathing room on the sides.
- **Format**: `.png` (transparent or solid). Keep file size <300 KB
  if possible so the agency dashboard stays snappy.
- **Style**: hand-illustrated gift-box vibe (matches Andrew's mock)
  works great. Themed accents per holiday — orange/black for
  Halloween, red ribbon for Valentine's, green clover for
  St. Patrick's, etc.

## Fallback when a file is missing

If a slug's image isn't here, the UI silently falls back to a
brand-gradient card with the template's emoji (🎁 for Birthday,
🎃 for Halloween, etc.). You can add files at your own pace — no
need to upload all 12 at once.

## Customer-facing override

A business can upload its OWN custom image per template in the edit
panel (uploads go to the `offer-images` Supabase bucket). That
upload wins over both the default in this folder and the emoji
fallback. The folder here is the *default* art for every business.
