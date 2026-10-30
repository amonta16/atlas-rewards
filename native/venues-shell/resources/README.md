# App icon + splash sources

Put two images in this folder before running the asset generator (step 4 of the CP-76 runbook):

- `icon.png` — 1024×1024, the neutral **Atlas Rewards** icon (NOT a business logo — this is the universal app). No transparency, no rounded corners (the OS rounds it).
- `splash.png` — 2732×2732, icon centered on a solid background (safe zone: keep everything inside the middle ~1200px).

Then: `npx @capacitor/assets generate --android`
