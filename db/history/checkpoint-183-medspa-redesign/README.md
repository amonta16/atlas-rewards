# CP-183 · /medspa rebuilt from the ground up ("porcelain & deep water")

No SQL. Replaces the CP-182 /medspa design (which reused the dark /venues theme). The quiz,
lead capture, Meta Pixel and UTM tracking are unchanged.

## The idea
Everything hangs on one fact from the med spa world: **every patient has a due date.**
- **Hero:** a 12-week treatment-cycle dial. The arc sweeps from her visit to week 10, the due
  point pulses, the reminder slides in, then "Booked for Thursday". One orchestrated load
  sequence, CSS only, static when reduced motion is on.
- **The leak:** "One patient, one year": two tracks comparing 2 visits on her own vs 5 with
  recall (labeled as an illustration).
- **What Atlas runs:** three expandable parts (app · recall · memberships) next to the
  tap-through demo phone.
- **Put your own numbers on it:** an Owner.com-style instant estimate (3 inputs, live result,
  same model as the quiz), then the quiz popup.
- **Everything included · four questions to ask any vendor · setup timeline · FAQ · closing.**

## Design tokens
- Colors: porcelain #F2F5F3, mist #DDE7E3, ink #0E2433 (Atlas deep ocean), tide #2C6E7F,
  quartz #D58C86 (only for "due"), champagne #B9985E (dial ticks).
- Type: Fraunces (display, optical size + soft axis) and Figtree (body/UI), self-hosted via
  fontsource. New dependencies: `@fontsource-variable/fraunces`, `@fontsource-variable/figtree`.

## Files
- `app/medspa/page.tsx` (uses the new fonts + `./medspa.css`), `app/medspa/medspa.css`
- `components/medspa/medspa-page.tsx` (rewritten), `cycle-dial.tsx`, `recall-calculator.tsx` (new)
- `lib/landing/medspa-fonts.ts` (new)
- `package.json` / `package-lock.json` (two font packages)

## Still true before ads (from CP-182)
Recall and banked membership credits must ship first; no testimonials yet; no before/after or
brand-name treatment claims in creative.

## Verified
`tsc --noEmit` clean; rendered at 1440px and 390px with no errors or horizontal overflow.
