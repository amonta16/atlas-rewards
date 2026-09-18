import io, sys, re
p = "components/agency/mystery-pool-manager.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n")
orig = s

def sub(old, new, label):
    global s
    if old not in s:
        sys.exit("MISS: " + label)
    if s.count(old) != 1:
        sys.exit("AMBIGUOUS: " + label)
    s = s.replace(old, new)

# 1 — type
sub("""  points_amount: number | null; reward_id: string | null;
  weight: number; is_active: boolean;
};""",
"""  points_amount: number | null; reward_id: string | null;
  weight: number; is_active: boolean;
  // CP-140: how long a reward won from this wedge stays claimable.
  // null = the 30-day default. Points prizes are always null.
  expires_days: number | null;
};

// CP-140: the windows worth offering. A short one is the whole point — it
// caps what a generous prize can cost and books the return visit.
const EXPIRY_OPTIONS: { value: number | null; label: string; hint?: string }[] = [
  { value: null, label: "Standard — 30 days" },
  { value: 1,    label: "1 day — tomorrow night",  hint: "Hardest push back in" },
  { value: 2,    label: "2 days" },
  { value: 3,    label: "3 days",                  hint: "Sweet spot for big prizes" },
  { value: 5,    label: "5 days" },
  { value: 7,    label: "7 days — one week" },
  { value: 14,   label: "14 days" },
  { value: 30,   label: "30 days" },
];

const expiryLabel = (d: number | null) =>
  d == null ? "30-day" : d === 1 ? "1-day" : `${d}-day`;""",
"type + EXPIRY_OPTIONS")

# 2 — save
sub("""      p_weight: editing.weight ?? 10,
      p_is_active: editing.is_active ?? true,
    });""",
"""      p_weight: editing.weight ?? 10,
      p_is_active: editing.is_active ?? true,
      // CP-140: points land in the balance instantly, so they never expire —
      // the server drops the window for them too, this is just honest input.
      p_expires_days: editing.kind === "reward" ? (editing.expires_days ?? null) : null,
    });""",
"savePrize rpc arg")

# 3 — header copy
sub("""            The check-in Prize Wheel shows THESE prizes on its wedges. Weight sets the odds —
            heavier lands more often. Point amounts or free rewards.""",
"""            The check-in Prize Wheel shows THESE prizes on its wedges. Weight sets the odds —
            heavier lands more often. Point amounts or free rewards.{" "}
            <strong>Give a big prize a short window</strong> and you can afford to hand it out far
            more often — it books the return visit instead of sitting in a wallet for a month.""",
"header copy")

# 4 — new-prize defaults
sub("""onClick={() => setEditing({ kind: "points", weight: 10, is_active: true })}""",
    """onClick={() => setEditing({ kind: "points", weight: 10, is_active: true, expires_days: null })}""",
    "add-prize defaults")

# 5 — row badge
sub("""                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Weight {p.weight} · ~{odds}% odds {!p.is_active && "· Inactive"}
                  </div>""",
"""                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>Weight {p.weight} · ~{odds}% odds {!p.is_active && "· Inactive"}</span>
                    {/* CP-140: the window is the strategy, so it reads at a
                        glance — highlighted when it's a short, urgent one. */}
                    {p.kind === "reward" && (
                      <span
                        className={
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold " +
                          (p.expires_days != null && p.expires_days <= 3
                            ? "bg-rose-50 text-rose-600"
                            : "bg-zinc-100 text-zinc-600")
                        }
                      >
                        <Clock className="h-2.5 w-2.5" />
                        {expiryLabel(p.expires_days)} window
                      </span>
                    )}
                  </div>""",
"row badge")

# 6 — icon import
sub("""import { Sparkles, Plus, X, Save, Trash2, Edit2, Info, Coins, Gift } from "lucide-react";""",
    """import { Sparkles, Plus, X, Save, Trash2, Edit2, Info, Coins, Gift, Clock } from "lucide-react";""",
    "icon import")

# 7 — the editor field, right after the reward picker block
sub("""              {/* CP-73.1: no separate photo upload — reward prizes
                  automatically use the reward's own image on the wheel
                  and the win reveal (no redone work). */}""",
"""              {/* CP-140: the expiry window. Reward prizes only — points are
                  banked the instant the wheel stops, so there is nothing to
                  expire. The window starts the day they win and runs to the
                  END of the last day, local time, so "3 days" reads as a date
                  on the customer's screen rather than a 72-hour stopwatch. */}
              {editing.kind === "reward" && (
                <div>
                  <Label className="text-xs text-muted-foreground">How long do they have to use it?</Label>
                  <select
                    value={editing.expires_days == null ? "" : String(editing.expires_days)}
                    onChange={e =>
                      setEditing({
                        ...editing,
                        expires_days: e.target.value === "" ? null : parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full mt-1 rounded-md border border-input bg-background h-9 px-2 text-sm"
                  >
                    {EXPIRY_OPTIONS.map(o => (
                      <option key={String(o.value)} value={o.value == null ? "" : String(o.value)}>
                        {o.label}{o.hint ? ` · ${o.hint}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                    {editing.expires_days == null ? (
                      <>Expires 30 days after they win — the standard window.</>
                    ) : (
                      <>
                        Won today → good through the end of{" "}
                        <strong>
                          {new Date(Date.now() + editing.expires_days * 86_400_000)
                            .toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                        </strong>
                        . The deadline shows on the win screen and counts down in their wallet.
                      </>
                    )}
                  </p>
                </div>
              )}
              {/* CP-73.1: no separate photo upload — reward prizes
                  automatically use the reward's own image on the wheel
                  and the win reveal (no redone work). */}""",
"expiry field")

assert s != orig
out = s.replace("\n", "\r\n") if CRLF else s
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched", p)
