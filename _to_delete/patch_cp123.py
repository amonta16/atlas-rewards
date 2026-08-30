import subprocess

R = "checkpoint-02-brand-engine/atlas-rewards-app/"

def load(p):
    return subprocess.run(["git", "show", "HEAD:" + R + p], capture_output=True, text=True, check=True).stdout

def save(p, src):
    with open(R + p, "w", encoding="utf-8", newline="") as f:
        f.write(src)

def rep(src, a, b, name):
    assert src.count(a) == 1, f"anchor fail: {name} ({src.count(a)})"
    return src.replace(a, b)

# ═══ A. shop catalog — path-form <a> → base-aware Link (CP-122 family) ═
p = "app/[business]/app/shop/shop-client.tsx"
src = load(p)
src = rep(src,
'import { Gift, Lock, Sparkles, Search, ChevronRight } from "lucide-react";',
'''import { Gift, Lock, Sparkles, Search, ChevronRight } from "lucide-react";
import Link from "next/link";
// CP-123: base-aware links — the raw path-form hrefs here were the same
// CP-45/CP-122 bug as Home's "View more rewards" (full reload + wrong
// URL on the subdomain PWA).
import { useAppBase } from "@/lib/use-app-base";''',
"shop import")

src = rep(src,
'''  const locked = pointsBalance < reward.point_cost;
  return (
    <a
      href={`/${businessSlug}/app/rewards?redeem=${reward.id}`}
      className="shrink-0 w-40 rounded-2xl border bg-white overflow-hidden hover:shadow-md transition-shadow"
      style={{ borderColor: locked ? undefined : primary + "55" }}
    >''',
'''  const locked = pointsBalance < reward.point_cost;
  const appBase = useAppBase(businessSlug);
  return (
    <Link
      href={`${appBase}/rewards?redeem=${reward.id}`}
      className="shrink-0 w-40 rounded-2xl border bg-white overflow-hidden hover:shadow-md transition-shadow"
      style={{ borderColor: locked ? undefined : primary + "55" }}
    >''',
"card small open")

# CardSmall closing </a>: the small card ends right after its points pill div.
src = rep(src,
'''          <Sparkles className="h-2.5 w-2.5" /> {reward.point_cost.toLocaleString()} pts
        </div>
      </div>
    </a>
  );
}''',
'''          <Sparkles className="h-2.5 w-2.5" /> {reward.point_cost.toLocaleString()} pts
        </div>
      </div>
    </Link>
  );
}''',
"card small close")

src = rep(src,
'''  return (
    <a
      href={`/${businessSlug}/app/rewards?redeem=${reward.id}`}
      className="rounded-2xl border bg-white overflow-hidden text-left hover:shadow-md transition-shadow active:scale-[0.98]"
      style={{ borderColor: locked ? undefined : primary + "55" }}
    >''',
'''  const appBase = useAppBase(businessSlug);
  return (
    <Link
      href={`${appBase}/rewards?redeem=${reward.id}`}
      className="rounded-2xl border bg-white overflow-hidden text-left hover:shadow-md transition-shadow active:scale-[0.98]"
      style={{ borderColor: locked ? undefined : primary + "55" }}
    >''',
"card large open")

# CardLarge closing </a> — find its unique tail: it is the LAST </a> paired
# with the CardLarge return. Identify via the remaining single occurrence.
assert src.count("    </a>\n  );\n}") == 1, f"large close count {src.count('    </a>')}"
src = src.replace("    </a>\n  );\n}", "    </Link>\n  );\n}", 1)
save(p, src)
print("shop-client OK")

# ═══ B. automated offers manager — custom occasion date picker ════════
p = "components/agency/automated-offers-manager.tsx"
src = load(p)

src = rep(src,
"""  voice_message_url: string | null;
  last_triggered_at: string | null;""",
"""  voice_message_url: string | null;
  last_triggered_at: string | null;
  // CP-123: per-business yearly date ({month, day, window_days}) — set by
  // the manager for the Custom Occasion template; null = template default.
  custom_trigger_config?: { month?: number; day?: number; window_days?: number } | null;""",
"row type")

src = rep(src,
"""    case "date":
    default: {
      const cfg = row.trigger_config as { month?: number; day?: number; window_days?: number };""",
"""    case "date":
    default: {
      // CP-123: the business's own date wins over the template's.
      const cfg = (row.custom_trigger_config ?? row.trigger_config) as { month?: number; day?: number; window_days?: number };
      if (!cfg?.month || !cfg?.day) {
        return "Pick your date in the editor — it fires every year around the day you choose.";
      }""",
"subtitle")

src = rep(src,
"""      p_voice_message_url: row.voice_message_url,
      p_gift_reward_id: row.gift_reward_id ?? null,  // CP-42
    });""",
"""      p_voice_message_url: row.voice_message_url,
      p_gift_reward_id: row.gift_reward_id ?? null,  // CP-42
      p_custom_trigger_config: row.custom_trigger_config ?? null,  // CP-123
    });""",
"toggle rpc")

src = rep(src,
"""      p_voice_message_url: editing.voice_message_url,
      p_gift_reward_id: editing.gift_reward_id ?? null,  // CP-42
    });""",
"""      p_voice_message_url: editing.voice_message_url,
      p_gift_reward_id: editing.gift_reward_id ?? null,  // CP-42
      p_custom_trigger_config: editing.custom_trigger_config ?? null,  // CP-123
    });""",
"save rpc")

src = rep(src,
"""          {/* Title + subtitle */}
          <div>
            <h3 className="text-lg font-extrabold">{row.name}</h3>
            <p className="text-sm text-zinc-500 mt-1 leading-snug">
              {triggerSubtitle(row)}
            </p>
          </div>""",
"""          {/* Title + subtitle */}
          <div>
            <h3 className="text-lg font-extrabold">{row.name}</h3>
            <p className="text-sm text-zinc-500 mt-1 leading-snug">
              {triggerSubtitle(row)}
            </p>
          </div>

          {/* CP-123: Custom Occasion — the manager picks the yearly date. */}
          {row.slug === "custom_occasion" && (
            <div className="rounded-2xl border bg-white p-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                When does it fire?
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <select
                  value={row.custom_trigger_config?.month ?? ""}
                  onChange={(e) => onChange({
                    custom_trigger_config: {
                      window_days: 3,
                      ...(row.custom_trigger_config ?? {}),
                      month: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })}
                  className="h-10 rounded-lg border bg-white px-2 text-sm font-semibold"
                  aria-label="Month"
                >
                  <option value="">Month…</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
                    </option>
                  ))}
                </select>
                <select
                  value={row.custom_trigger_config?.day ?? ""}
                  onChange={(e) => onChange({
                    custom_trigger_config: {
                      window_days: 3,
                      ...(row.custom_trigger_config ?? {}),
                      day: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })}
                  className="h-10 rounded-lg border bg-white px-2 text-sm font-semibold"
                  aria-label="Day"
                >
                  <option value="">Day…</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <select
                  value={row.custom_trigger_config?.window_days ?? 3}
                  onChange={(e) => onChange({
                    custom_trigger_config: {
                      ...(row.custom_trigger_config ?? {}),
                      window_days: Number(e.target.value),
                    },
                  })}
                  className="h-10 rounded-lg border bg-white px-2 text-sm font-semibold"
                  aria-label="Days around the date"
                >
                  {[1, 3, 5, 7, 14].map(w => (
                    <option key={w} value={w}>±{w} day{w === 1 ? "" : "s"}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">
                Fires every year around this date — name it with the title field
                below (e.g. &ldquo;Shop Anniversary&rdquo;).
              </p>
              {(!row.custom_trigger_config?.month || !row.custom_trigger_config?.day) && (
                <p className="text-[11px] font-semibold text-amber-600 mt-1">
                  ⚠ No date picked yet — this occasion won&rsquo;t fire until you choose one.
                </p>
              )}
            </div>
          )}""",
"date picker")

save(p, src)
print("offers-manager OK")
