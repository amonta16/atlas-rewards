# CP-133 · Bigger prize wheel, more prizes

App-side change plus one tiny SQL (optional — only needed if a business will have more than 12 prizes).

- **Size:** the wheel now fills the phone width — `min(88vw, 46vh, 360px)` instead of a fixed 256px — so it's ~35–40% bigger on a normal phone and still fits above the Spin button on short screens. Pointer and hub scaled up, header spacing tightened.
- **More prizes:** wedges follow the pool. Up to 8 prizes → 8 wedges (short pools repeat to fill, as before). 9–16 prizes → one wedge per prize. Above 16 the wheel stays at 16 (thinner wedges aren't readable). Labels, icons and prize photos scale down in two steps as wedges get thinner; the tiny "PTS" caption drops off at 13+.
- **SQL (`cp133_wheel_16.sql`):** `mystery_wheel_segments` returned at most 12 prizes; raised to 16 to match. Skip it if no one has more than 12 prizes yet.

Landing math is unchanged — the awarded prize's wedge is picked the same way, just against the new count. `tsc` clean.

## Push
```
git fetch origin
git reset --mixed origin/main
git add -A
git commit -m "CP-133: bigger prize wheel (fills phone width) + one wedge per prize up to 16"
git push origin main
```
