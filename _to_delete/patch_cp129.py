import subprocess, sys

R = "checkpoint-02-brand-engine/atlas-rewards-app/"
MODE = sys.argv[1] if len(sys.argv) > 1 else "device"

def load(p):
    if MODE == "mirror":
        return open(p, encoding="utf-8").read()
    return subprocess.run(["git", "show", "HEAD:" + R + p], capture_output=True, text=True, check=True).stdout

def save(p, src):
    path = p if MODE == "mirror" else R + p
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(src)

def rep(src, a, b, name):
    assert src.count(a) == 1, f"anchor fail: {name} ({src.count(a)})"
    return src.replace(a, b)

# ═══ CP-129 · demo polish: text fix, design preset, review boost,
#              auto-folders, niche re-pick, library industries ═════════

# ── 1. image-library: three new upload targets ────────────────────────
p = "lib/image-library.ts"
src = load(p)
src = rep(src,
"""  "ice-cream": "Ice Cream",
  "restaurant": "Restaurant",
};""",
"""  "ice-cream": "Ice Cream",
  "restaurant": "Restaurant",
  // CP-129: sets for the CP-128 packs that had no imagery — upload a
  // handful of photos to each in the admin library and every matching
  // demo build picks them up automatically.
  "general": "General (any shop)",
  "fitness": "Gym & Fitness",
  "retail": "Retail & Boutique",
};""",
"library labels")
save(p, src)
print("image-library OK")

# ── 2. demo-packs: the house design preset ────────────────────────────
p = "lib/demo-packs.ts"
src = load(p)
src = rep(src,
"""        mystery: m.mystery ?? false,
      })),
    },
  };
}""",
"""        mystery: m.mystery ?? false,
      })),
    },
  };
}

/* ── CP-129: the house design preset ──────────────────────────────────
   Andrew's curated look — applied to every freshly built demo so the
   average demo lands polished instead of on defaults. The background
   pattern rotates through the four that look good on anything; its
   color falls back to the brand primary automatically (CP-57). */

export const DEMO_DESIGN_PRESET = {
  points_card_style: "shiny",
  button_style: "rounded",
  banner_style: "gradient",
  offer_card_style: "clean",
  reward_card_style: "outline",
  badge_style: "gradient",
  heading_style: "sticker",
  divider_style: "none",
  cta_glow: "none",
  streak_theme: "brand",
  streak_page_theme: "brand-app",
  streak_progress_mode: "brand",
} as const;

export const DEMO_PATTERNS = ["none", "hills", "diagonal", "lowpoly"] as const;

/** The businesses-row update for a new demo. Pass a batch index to cycle
 *  patterns deterministically; omit it for a random pick. */
export function demoDesignPayload(i?: number) {
  const pick = typeof i === "number"
    ? i % DEMO_PATTERNS.length
    : Math.floor(Math.random() * DEMO_PATTERNS.length);
  return { ...DEMO_DESIGN_PRESET, background_pattern: DEMO_PATTERNS[pick] };
}""",
"design preset")
save(p, src)
print("demo-packs OK")

# ── 3. places-lookup: return the shop's Google review link ────────────
p = "app/api/field/places-lookup/route.ts"
src = load(p)
src = rep(src,
'          "places.displayName,places.formattedAddress,places.types,places.primaryType,places.websiteUri,places.nationalPhoneNumber",',
'          "places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.websiteUri,places.nationalPhoneNumber",',
"lookup fieldmask")
src = rep(src,
"""    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      primaryType?: string;
      websiteUri?: string;
      nationalPhoneNumber?: string;
    }>;""",
"""    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      primaryType?: string;
      websiteUri?: string;
      nationalPhoneNumber?: string;
    }>;""",
"lookup type")
src = rep(src,
"""  return NextResponse.json({
    name,
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website,
    niche,
    logoDataUrl,
  });""",
"""  return NextResponse.json({
    name,
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website,
    niche,
    logoDataUrl,
    // CP-129: the shop's REAL "write a review" page — wired straight into
    // the demo's Google review boost.
    reviewUrl: p.id ? `https://search.google.com/local/writereview?placeid=${p.id}` : null,
  });""",
"lookup response")
save(p, src)
print("places-lookup OK")

# ── 4. places-nearby: same review link per scanned shop ───────────────
p = "app/api/field/places-nearby/route.ts"
src = load(p)
src = rep(src,
'          "places.displayName,places.formattedAddress,places.types,places.primaryType",',
'          "places.id,places.displayName,places.formattedAddress,places.types,places.primaryType",',
"nearby fieldmask")
src = rep(src,
"""    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      primaryType?: string;
    }>;""",
"""    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      primaryType?: string;
    }>;""",
"nearby type")
src = rep(src,
"""      return {
        name,
        address: p.formattedAddress ?? null,
        niche: guessNiche(soup, "general"),
      };""",
"""      return {
        name,
        address: p.formattedAddress ?? null,
        niche: guessNiche(soup, "general"),
        reviewUrl: p.id ? `https://search.google.com/local/writereview?placeid=${p.id}` : null,
      };""",
"nearby response")
save(p, src)
print("places-nearby OK")

# ── 5. field-demo-modal: text root fix, preset, review URL, folders ───
p = "components/field/field-demo-modal.tsx"
src = load(p)

src = rep(src,
"""import {
  NICHE_ORDER, NICHE_META, COLOR_THEMES, getDemoPack, packPayload, type DemoNiche,
} from "@/lib/demo-packs";""",
"""import {
  NICHE_ORDER, NICHE_META, COLOR_THEMES, getDemoPack, packPayload, demoDesignPayload, type DemoNiche,
} from "@/lib/demo-packs";
import { cityFromAddress, fileDemoIntoFolders } from "@/lib/demo-folders";""",
"demo imports")

# CP-129: one class on the modal card ends the whole family of inherited
# white-text bugs (the dark Field App shell leaks `color` into the modal).
src = rep(src,
'      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"',
'      <div className="w-full sm:max-w-md bg-white text-zinc-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"',
"demo root color")

src = rep(src,
"""  const [foundMeta, setFoundMeta] = useState<{
    address?: string | null; phone?: string | null; website?: string | null;
  }>({});""",
"""  const [foundMeta, setFoundMeta] = useState<{
    address?: string | null; phone?: string | null; website?: string | null;
    reviewUrl?: string | null;
  }>({});""",
"demo meta type")

src = rep(src,
"      setFoundMeta({ address: j.address, phone: j.phone, website: j.website });",
"      setFoundMeta({ address: j.address, phone: j.phone, website: j.website, reviewUrl: j.reviewUrl });",
"demo meta capture")

src = rep(src,
"      const slug = row?.new_slug as string;",
"""      const slug = row?.new_slug as string;
      const bizId = row?.new_business_id as string | undefined;""",
"demo biz id")

src = rep(src,
"""      } catch { /* best-effort */ }
      onCreated?.();""",
"""      } catch { /* best-effort */ }
      // CP-129: house design preset + Google review boost + auto-filing
      // into "<City>" ▸ "<Niche>" folders. All best-effort.
      if (bizId) {
        try {
          const { data: wc } = await supabase
            .from("businesses").select("widget_config").eq("id", bizId).single();
          const widget = { ...((wc?.widget_config as Record<string, unknown> | null) ?? {}), reviews: true };
          await supabase.from("businesses").update({
            ...demoDesignPayload(),
            widget_config: widget,
            ...(foundMeta.reviewUrl ? { google_review_url: foundMeta.reviewUrl } : {}),
          }).eq("id", bizId);
        } catch { /* design preset is best-effort */ }
        const city = cityFromAddress(foundMeta.address);
        if (city) await fileDemoIntoFolders(supabase, bizId, city, NICHE_META[niche].label);
      }
      onCreated?.();""",
"demo post-create")
save(p, src)
print("demo modal OK")

# ── 6. field-batch-modal: text root, niche re-pick, preset, folders ───
p = "components/field/field-batch-modal.tsx"
src = load(p)

src = rep(src,
"""import {
  NICHE_ORDER, NICHE_META, PRESET_THEMES, themeForIndex,
  getDemoPack, packPayload, guessNiche, type DemoNiche,""",
"""import {
  NICHE_ORDER, NICHE_META, PRESET_THEMES, themeForIndex,
  getDemoPack, packPayload, guessNiche, demoDesignPayload, type DemoNiche,""",
"batch import packs")

src = rep(src,
'import { monogramDataUrl } from "@/lib/logo-colors";',
"""import { monogramDataUrl } from "@/lib/logo-colors";
import { cityFromAddress, fileDemoIntoFolders } from "@/lib/demo-folders";""",
"batch import folders")

src = rep(src,
'      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"',
'      <div className="w-full sm:max-w-md bg-white text-zinc-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"',
"batch root color")

src = rep(src,
"""  const [nearby, setNearby] = useState<
    Array<{ name: string; address: string | null; niche: DemoNiche; checked: boolean }> | null
  >(null);""",
"""  const [nearby, setNearby] = useState<
    Array<{ name: string; address: string | null; niche: DemoNiche; checked: boolean; reviewUrl: string | null }> | null
  >(null);
  // CP-129: what the scan knew about each shop (address for auto-filing,
  // review link for the review boost) — survives into the build loop.
  const [scanInfo, setScanInfo] = useState<Record<string, { address: string | null; reviewUrl: string | null }>>({});""",
"batch scan state")

src = rep(src,
"""      const found = ((j.places ?? []) as Array<{ name?: string; address?: string | null; niche?: string }>)
        .map((p) => ({
          // commas would split the "name, niche" line format
          name: String(p.name || "").replace(/,/g, " ").replace(/\\s+/g, " ").trim(),
          address: p.address ?? null,
          niche: (p.niche && p.niche in NICHE_META ? p.niche : "general") as DemoNiche,
          checked: true,
        }))
        .filter((p) => p.name);""",
"""      const found = ((j.places ?? []) as Array<{ name?: string; address?: string | null; niche?: string; reviewUrl?: string | null }>)
        .map((p) => ({
          // commas would split the "name, niche" line format
          name: String(p.name || "").replace(/,/g, " ").replace(/\\s+/g, " ").trim(),
          address: p.address ?? null,
          niche: (p.niche && p.niche in NICHE_META ? p.niche : "general") as DemoNiche,
          checked: true,
          reviewUrl: p.reviewUrl ?? null,
        }))
        .filter((p) => p.name);""",
"batch scan map")

src = rep(src,
"""    if (lines.length) {
      setText((t) => (t.trim() ? t.replace(/\\s+$/, "") + "\\n" : "") + lines.join("\\n"));
    }
    setNearby(null);""",
"""    if (lines.length) {
      setText((t) => (t.trim() ? t.replace(/\\s+$/, "") + "\\n" : "") + lines.join("\\n"));
    }
    // CP-129: remember each added shop's address + review link for the run.
    setScanInfo((prev) => {
      const next = { ...prev };
      for (const p of nearby) {
        if (p.checked) next[p.name.toLowerCase()] = { address: p.address, reviewUrl: p.reviewUrl };
      }
      return next;
    });
    setNearby(null);""",
"batch addNearby info")

src = rep(src,
"""                        <label key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50">
                          <input type="checkbox" checked={p.checked}
                            onChange={() => setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, checked: !x.checked } : x)))} />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold text-zinc-900 block truncate">{p.name}</span>
                            {p.address && <span className="text-[10px] text-zinc-400 block truncate">{p.address}</span>}
                          </span>
                          <span className="text-sm">{NICHE_META[p.niche].emoji}</span>
                        </label>""",
"""                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50">
                          <input type="checkbox" checked={p.checked}
                            onChange={() => setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, checked: !x.checked } : x)))} />
                          <span className="min-w-0 flex-1 cursor-pointer"
                            onClick={() => setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, checked: !x.checked } : x)))}>
                            <span className="font-semibold text-zinc-900 block truncate">{p.name}</span>
                            {p.address && <span className="text-[10px] text-zinc-400 block truncate">{p.address}</span>}
                          </span>
                          {/* CP-129: mixed plazas — fix a wrong niche guess on the spot. */}
                          <select
                            value={p.niche}
                            onChange={(e) => {
                              const v = e.target.value as DemoNiche;
                              setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, niche: v } : x)));
                            }}
                            className="shrink-0 rounded-lg border bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700"
                          >
                            {NICHE_ORDER.map(k => (
                              <option key={k} value={k}>{NICHE_META[k].emoji} {NICHE_META[k].label.split(" ")[0]}</option>
                            ))}
                          </select>
                        </div>""",
"batch niche repick")

src = rep(src,
"""        } catch { /* best-effort */ }""",
"""        } catch { /* best-effort */ }
        // CP-129: house design preset + review boost + auto-filing into
        // "<City>" ▸ "<Niche>" folders. All best-effort.
        if (out?.new_business_id) {
          const bizId = out.new_business_id as string;
          const info = scanInfo[row.name.toLowerCase()];
          try {
            const { data: wc } = await supabase
              .from("businesses").select("widget_config").eq("id", bizId).single();
            const widget = { ...((wc?.widget_config as Record<string, unknown> | null) ?? {}), reviews: true };
            await supabase.from("businesses").update({
              ...demoDesignPayload(i),
              widget_config: widget,
              ...(info?.reviewUrl ? { google_review_url: info.reviewUrl } : {}),
            }).eq("id", bizId);
          } catch { /* best-effort */ }
          const city = cityFromAddress(info?.address);
          if (city) await fileDemoIntoFolders(supabase, bizId, city, NICHE_META[row.niche].label);
        }""",
"batch post-create")
save(p, src)
print("batch modal OK")
