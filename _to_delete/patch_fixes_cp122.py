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

# ═══ FIX 1: Home page — raw path-form anchors → base-aware AppLink ═══
p = "app/[business]/app/page.tsx"
src = load(p)
src = rep(src,
'import { TopRewardsGrid } from "@/components/customer/top-rewards-grid";',
'''import { TopRewardsGrid } from "@/components/customer/top-rewards-grid";
// CP-122: base-aware client link for server components — kills the raw
// path-form <a> reload/glitch on "See all" + "View more rewards".
import { AppLink } from "@/components/customer/app-link";''',
"home import")

src = rep(src,
'''            <a
              href={`/${params.business}/app/rewards`}
              className="inline-flex items-center gap-1 text-xs font-extrabold text-white rounded-full pl-3 pr-2 py-1.5 shadow-md active:scale-95 transition"
              style={{
                background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                boxShadow: `0 6px 16px -4px ${business.brand_colors.primary}88`,
              }}
            >
              See all <ChevronRight className="h-3.5 w-3.5" />
            </a>''',
'''            <AppLink
              slug={params.business}
              to="/rewards"
              className="inline-flex items-center gap-1 text-xs font-extrabold text-white rounded-full pl-3 pr-2 py-1.5 shadow-md active:scale-95 transition"
              style={{
                background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                boxShadow: `0 6px 16px -4px ${business.brand_colors.primary}88`,
              }}
            >
              See all <ChevronRight className="h-3.5 w-3.5" />
            </AppLink>''',
"see all")

src = rep(src,
'''          <a
            href={`/${params.business}/app/shop`}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
            style={{
              background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
              boxShadow: `0 10px 22px -8px ${business.brand_colors.primary}aa`,
            }}
          >
            View more rewards <ChevronRight className="h-4 w-4" />
          </a>''',
'''          <AppLink
            slug={params.business}
            to="/shop"
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
            style={{
              background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
              boxShadow: `0 10px 22px -8px ${business.brand_colors.primary}aa`,
            }}
          >
            View more rewards <ChevronRight className="h-4 w-4" />
          </AppLink>''',
"view more")
save(p, src)
print("home OK")

# ═══ FIX 3: join page — never strand the add-another-shop path ═══════
p = "app/join/page.tsx"
src = load(p)
src = rep(src,
"""  async function lookup(raw: string): Promise<FoundBusiness | null> {""",
"""  // CP-122: the "Add another shop" path (?stay=1) used to land on the bare
  // code screen with NO way back — customers had to scan a new business or
  // kill the app to return to their shop. Load their memberships so the
  // "Back to my shop(s)" button always exists here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).get("stay")) return;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.rpc("my_memberships");
        const shops = (Array.isArray(data) ? data : []) as BootShop[];
        if (shops.length > 0) setStashedShops(shops);
      } catch { /* offline — plain code screen stays usable */ }
    })();
  }, []);

  async function lookup(raw: string): Promise<FoundBusiness | null> {""",
"stay effect")

src = rep(src,
"""          <button
            type="button"
            onClick={() => { setChooser(stashedShops); setStashedShops(null); setBiz(null); setCode(""); setErr(null); }}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-zinc-800"
          >
            <ArrowRight className="h-4 w-4 rotate-180" /> Back to my shops
          </button>""",
"""          <button
            type="button"
            onClick={() => {
              // CP-122: one shop → jump STRAIGHT back into it (no chooser
              // of one); several → show the chooser.
              if (stashedShops.length === 1 && stashedShops[0].slug) {
                window.location.href = businessEntryUrl(stashedShops[0].slug);
                return;
              }
              setChooser(stashedShops); setStashedShops(null); setBiz(null); setCode(""); setErr(null);
            }}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-zinc-800"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            {stashedShops.length === 1 ? "Back to my shop" : "Back to my shops"}
          </button>""",
"back button")
save(p, src)
print("join OK")

# ═══ FIX 4: builder — warn when reviews are on but the link is empty ═
p = "components/brand-editor/brand-editor.tsx"
src = load(p)
src = rep(src,
"""                <Field label="Google review URL">
                  <Input value={b.google_review_url ?? ""} onChange={e => update("google_review_url", e.target.value)} placeholder="https://g.page/…/review" />
                </Field>""",
"""                <Field label="Google review URL">
                  <Input value={b.google_review_url ?? ""} onChange={e => update("google_review_url", e.target.value)} placeholder="https://g.page/…/review" />
                  {/* CP-122: since CP-103, the customer app hides the review
                      prompt AND the Rewards-tab "!" nudge unless this link is
                      set — surface that loudly instead of failing silently. */}
                  {!!(b.widget_config as { reviews?: boolean } | null)?.reviews && !(b.google_review_url ?? "").trim() && (
                    <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
                      ⚠ Reviews are enabled but this link is empty — the review request and the
                      &ldquo;!&rdquo; nudge stay hidden in the customer app until you paste the
                      business&rsquo;s Google review URL here.
                    </p>
                  )}
                </Field>""",
"builder warn")
save(p, src)
print("brand-editor OK")

# ═══ FIX 2b: award-event — stamp its bell row (cron re-pushed it) ════
p = "app/api/notifications/award-event/route.ts"
src = load(p)
src = rep(src,
"""      await admin.from("notifications").insert({
        user_id: userId,
        business_id,
        kind: "reward_unlocked",
        title,
        body: messageBody,
        link_path: "/app/rewards",
      });""",
"""      await admin.from("notifications").insert({
        user_id: userId,
        business_id,
        kind: "reward_unlocked",
        title,
        body: messageBody,
        link_path: "/app/rewards",
        // CP-122: this route pushes synchronously below — stamp the row so
        // the per-minute cron doesn't push the same message again.
        push_sent_at: new Date().toISOString(),
      });""",
"award-event stamp")
save(p, src)
print("award-event OK")
