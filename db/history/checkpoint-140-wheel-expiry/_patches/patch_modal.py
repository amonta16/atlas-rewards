import io, sys
p = "components/customer/daily-mystery-modal.tsx"
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

# 1 — Prize type carries the deadline (and so survives in localStorage for the
#     "already spun today" view, which re-reads the same stored object).
sub("""  kind?: string;
  image?: string | null;
};""",
"""  kind?: string;
  image?: string | null;
  // CP-140: server-issued deadline for reward prizes (ISO). null for points.
  expiresAt?: string | null;
};

// CP-140: the deadline is the whole point of a short window — it has to read
// as a date on the win screen, not a countdown the customer has to do in
// their head. "Use by Thu, Sep 21".
function useByLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  // The stored instant is midnight AFTER the last usable day, so step back
  // inside that day before formatting.
  return new Date(t - 60_000).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}""",
"prize type + useByLabel")

# 2 — read the new column off the RPC row
sub("""      prize_image_url: string | null; kind: string | null;
      points_amount: number | null; coupon_code: string | null;
    };""",
"""      prize_image_url: string | null; kind: string | null;
      points_amount: number | null; coupon_code: string | null;
      prize_expires_at: string | null;   // CP-140
    };""",
"rpc row type")

sub("""      kind: row.kind ?? "points",
      image: row.prize_image_url,
    };""",
"""      kind: row.kind ?? "points",
      image: row.prize_image_url,
      expiresAt: row.prize_expires_at ?? null,   // CP-140
    };""",
"prize object")

# 3 — the reveal states the deadline
sub("""              ) : (
                <div className="text-white/80 text-sm mb-6 px-4">
                  Added to your rewards — show it at the counter to claim.
                </div>
              )}""",
"""              ) : (
                <div className="mb-6 px-4">
                  <div className="text-white/80 text-sm">
                    Added to your rewards — show it at the counter to claim.
                  </div>
                  {/* CP-140: a short window only drives a return visit if the
                      customer is told about it at the moment they win. */}
                  {useByLabel(prize.expiresAt) && (
                    <div
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                      style={{
                        background: "rgba(244,63,94,0.14)",
                        color: "#fda4af",
                        border: "1px solid rgba(244,63,94,0.35)",
                      }}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Use by {useByLabel(prize.expiresAt)}
                    </div>
                  )}
                </div>
              )}""",
"reveal deadline")

# 4 — the "already spun today" replay shows it too
sub("""                  {storedPrize.points > 0 && (
                    <div className="text-white/70 text-sm font-semibold">
                      +{storedPrize.points} bonus points
                    </div>
                  )}""",
"""                  {storedPrize.points > 0 && (
                    <div className="text-white/70 text-sm font-semibold">
                      +{storedPrize.points} bonus points
                    </div>
                  )}
                  {/* CP-140: reopening the wheel later today is the most
                      likely moment they check the deadline. */}
                  {useByLabel(storedPrize.expiresAt) && (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rose-300">
                      <Clock className="h-3.5 w-3.5" />
                      Use by {useByLabel(storedPrize.expiresAt)}
                    </div>
                  )}""",
"claimed deadline")

# 5 — icon import
sub("""import { X, Lock, Zap, RotateCcw, Coins, Gift, PartyPopper } from "lucide-react";""",
    """import { X, Lock, Zap, RotateCcw, Coins, Gift, PartyPopper, Clock } from "lucide-react";""",
    "icon import")

assert s != orig
out = s.replace("\n", "\r\n") if CRLF else s
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched", p)
