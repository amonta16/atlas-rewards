# CP-61 (proposed) — AI App Builder: "Build my app for me"

**Status: spec for your approval — not built yet.** Provider/key decision is
still open (you said decide later).

## The idea in one line

The agency types a sentence about a business → an AI generates a complete,
on-brand starter app (colors, copy, design style, background, rewards, a welcome
offer, point rules) → one click applies it to the business → everything stays
fully editable in the brand editor you already have.

This is very doable specifically because Atlas is already **config-driven**: a
`businesses` row holds brand colors, welcome message, `card_style`,
`button_style`, `background_pattern`, `banner_style`, and `point_rules`; rewards
and offers live in their own tables. The AI just has to fill those fields with
good values — it isn't writing code, it's writing configuration.

## What the agency sees (UX)

1. A **"✨ Build with AI"** button in the New Business flow and in the brand
   editor (so you can generate at creation *or* re-generate anytime).
2. A tiny form:
   - Business name
   - Type / industry (your existing industry presets, or free text)
   - Vibe / keywords — e.g. "warm, upscale, coastal" or "fun, bold, kid-friendly"
   - *Optional:* paste their website URL or a one-line description
   - *Optional:* what they sell + typical price point (sharpens the rewards)
3. **Generate** → ~5–15s spinner → the result renders live in the **phone
   preview you already have**, with proposed color swatches, welcome copy,
   design style, 3–5 rewards, and a welcome offer.
4. Buttons: **Apply to app** · **Regenerate** · **Tweak first**. Nothing is
   saved until you hit Apply, and after applying it's all normal editable config.

## What the AI fills in (mapped to your schema)

| Field | Source table/column | Notes |
|---|---|---|
| Brand colors | `businesses.brand_colors` | 3 on-brand hexes |
| Welcome message | `businesses.welcome_message` | friendly one-liner |
| Card / button style | `businesses.card_style` / `button_style` | chosen from the CP-58 enums |
| Background design | `businesses.background_pattern` (+ `pattern_color`) | chosen from the CP-58.1 list |
| Offer banner style | `businesses.banner_style` | from the CP-56 list |
| Point rules | `businesses.point_rules` | first-visit bonus, points-per-visit/$ |
| 3–5 rewards | `rewards` table | name, point cost, short description |
| Welcome offer | `offers` table | title, description, discount |

The model is given the **exact allowed IDs** for the style enums, so it can only
pick real options — the same validation that prevents the background-pattern
CHECK-constraint problem we just hit.

## Architecture (provider-agnostic)

- **Server API route** `app/api/agency/ai-build/route.ts` (POST). Runs
  server-side so the API key never touches the browser. Gated to `agency_admin`
  (same `business_users` check the agency pages use).
- **`lib/ai/provider.ts`** — one function `generateAppConfig(input)` that calls
  whichever LLM is configured (Anthropic Messages API *or* OpenAI) via an env
  flag. Uses **structured/JSON output** with a fixed schema so we always get
  clean, parseable config.
- **Validation layer** — validate the returned JSON against the allowed enums
  and clamp/normalize (hex format, point ranges, reward counts). Invalid values
  are dropped, never written. This is what keeps it safe.
- **Apply step** — writes `businesses` update + `rewards`/`offers` inserts within
  the admin's existing permissions (or a small `apply_ai_app` RPC).
- *Optional* — if a website URL is provided, fetch + summarize it server-side and
  feed that in for a more on-brand result.

## Keys, cost, safety

- **One env var**: `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` (your pick, your
  budget).
- **Cost**: a single generation is small JSON output — a few cents at most.
  Negligible per app. Add a soft cap (e.g. 20 generations/day/agency) to avoid
  runaway usage.
- **Safety**: structured output + enum validation = no junk written; a preview
  step means nothing auto-commits; generations can be logged for review.

## Scope / effort

- **Migration**: none required (uses existing tables). Optional
  `ai_generations` log table if you want history.
- **New files**: `lib/ai/provider.ts`, `app/api/agency/ai-build/route.ts`, a
  "Build with AI" modal/panel in the brand editor, preview wiring, apply logic.
- **Reuses**: the phone preview, the style enums, the rewards/offers managers.
- **Estimate**: one focused checkpoint once the provider is chosen.

## Decisions needed before I build

1. **Provider + key** — Anthropic (Claude) or OpenAI, and who supplies the key.
2. **Website ingestion** — should it read the business's website when provided,
   or just work from the form?
3. **v1 depth** — generate rewards + offer too, or start with just
   brand + design + copy and add rewards in v2?
4. **Placement** — New Business flow, brand editor, or both (my recommendation:
   both).
