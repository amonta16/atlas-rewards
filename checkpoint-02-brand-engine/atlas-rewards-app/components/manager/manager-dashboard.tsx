"use client";
import { useEffect, useState, useTransition } from "react";
import { ScanLine, UserSearch, History, LogOut, Gift, Tag, Newspaper, Home, Check, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { QrScanner } from "@/components/manager/qr-scanner";
import { AwardPointsPanel } from "@/components/manager/award-points-panel";
import { RedemptionFulfillPanel, type RedemptionLookup } from "@/components/manager/redemption-fulfill-panel";
import { ReviewQueue } from "@/components/manager/review-queue";
import { PendingMembershipsQueue } from "@/components/manager/pending-memberships-queue";
import { ManagerOffersPreview } from "@/components/manager/manager-offers-preview";
import { ScannerListener } from "@/components/manager/scanner-listener";
import { CustomerSearch } from "@/components/manager/customer-search";
import { DailyRecapCard } from "@/components/manager/daily-recap-card";
// CP-42: bright value-prop hero strip — proves Atlas's ROI at a glance.
import { AtlasValueStrip } from "@/components/manager/atlas-value-strip";
import { TeamMembers } from "@/components/team/team-members";
// CP-36b: NotificationBroadcast removed — moved to agency settings.
import { OffersManager } from "@/components/agency/offers-manager";
import { AutomatedOffersManager } from "@/components/agency/automated-offers-manager";
import { NewsManager } from "@/components/agency/news-manager";
// Products manager removed — Atlas is loyalty-only.
// Booking removed — Atlas is loyalty-only.
import { ManagerBilling } from "@/components/manager/manager-billing";
import { InsightsDashboard } from "@/components/manager/insights-dashboard";
import { MembershipBillingSetup } from "@/components/manager/membership-billing-setup";
import { CreditCard, BarChart3, Crown } from "lucide-react";
import type { Business } from "@/lib/types/database";

// Booking tab removed — Atlas is loyalty-only.
// CP-36b: Notifications tab removed from manager view. Manual broadcast
// + per-business notification toggles now live in the agency admin's
// business settings (NotificationSettings panel) so the entire
// notification surface is owned by the agency, not the front desk.
type ManagerTab = "desk" | "offers" | "news" | "insights" | "billing" | "membership" | "team";

/** Roles returned by public.current_app_role(business_id) — CP-22 SQL. */
type AppRole = "agency_admin" | "business_manager" | "business_staff" | "customer" | null;

// CP-22: front-desk (business_staff) is locked out of Billing + Insights —
// they don't see the tabs, and the underlying RPCs are RLS-gated on
// is_business_manager() too so a direct API call also returns nothing.
function managerTabsFor(_business: Business, role: AppRole): { id: ManagerTab; label: string; icon: React.ReactNode }[] {
  const isManager = role === "business_manager" || role === "agency_admin";
  const tabs: { id: ManagerTab; label: string; icon: React.ReactNode }[] = [
    { id: "desk", label: "Front desk", icon: <Home className="h-4 w-4" /> },
  ];
  if (isManager) {
    tabs.push({ id: "insights", label: "Insights", icon: <BarChart3 className="h-4 w-4" /> });
  }
  tabs.push({ id: "offers", label: "Offers", icon: <Tag className="h-4 w-4" /> });
  tabs.push({ id: "news",   label: "News",   icon: <Newspaper className="h-4 w-4" /> });
  if (isManager) {
    tabs.push({ id: "billing",    label: "Billing",    icon: <CreditCard className="h-4 w-4" /> });
    tabs.push({ id: "membership", label: "Membership", icon: <Crown className="h-4 w-4" /> });
    // CP-31: managers can invite front-desk staff for their own business.
    tabs.push({ id: "team",       label: "Team",       icon: <Shield className="h-4 w-4" /> });
    // CP-36b: Notifications tab removed — moved to agency admin's
    // per-business settings (toggles + composer live there now).
  }
  return tabs;
}

type Member = {
  membership_id: string; user_id: string; full_name: string | null;
  email: string | null; phone: string | null;
  points_balance: number; tier: string; joined_at: string; visit_count: number;
};

type LedgerRow = {
  id: string;
  delta: number;
  rule_type: string;
  notes: string | null;
  created_at: string;
  // CP-42: joined from memberships/profiles in the page loader so the
  // front desk sees who each transaction belongs to.
  customer_name?: string | null;
};

export function ManagerDashboard({ business: initialBusiness, recent }: { business: Business; recent: LedgerRow[] }) {
  const router = useRouter();
  const [business, setBusiness] = useState<Business>(initialBusiness);
  const [tab, setTab] = useState<ManagerTab>("desk");
  const [mode, setMode] = useState<"idle" | "scanning" | "code-entry">("idle");
  const [code, setCode] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [redemption, setRedemption] = useState<RedemptionLookup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offersSubTab, setOffersSubTab] = useState<"one-time" | "automated">("one-time");
  const [savingBiz, startBizSave] = useTransition();
  const [bizSavedAt, setBizSavedAt] = useState<Date | null>(null);

  // CP-22: figure out which role the caller has so we can hide Billing +
  // Insights from front desk. RLS still enforces the actual data block —
  // this is purely so staff don't see options they can't use.
  const [role, setRole] = useState<AppRole>(null);
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("current_app_role", { p_business_id: business.id });
      setRole((typeof data === "string" ? data : (data as any)?.[0]) as AppRole);
    })();
  }, [business.id]);

  const visibleTabs = managerTabsFor(business, role);
  // If the user clicked into a tab that role-loading then disallows
  // (e.g. they were on Billing and the role resolved to business_staff),
  // bounce them back to the always-available Front desk.
  useEffect(() => {
    if (!visibleTabs.some(t => t.id === tab)) setTab("desk");
  }, [visibleTabs, tab]);

  /** Save patches to the business record (products edits etc.). */
  function persistBusiness(patch: Partial<Business>) {
    const next = { ...business, ...patch };
    setBusiness(next);
    startBizSave(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("businesses")
        .update({ services: next.services })
        .eq("id", business.id);
      if (!error) setBizSavedAt(new Date());
      else alert("Save failed: " + error.message);
    });
  }

  /** Smart resolver — tries member code first, then redemption code. */
  async function resolveCode(rawCode: string) {
    setErr(null);
    const c = rawCode.trim().toUpperCase();
    if (!c) { setErr("Empty code."); return; }

    const supabase = createClient();

    // 1. Try as a member code (6 hex chars)
    const { data: memData } = await supabase.rpc("resolve_member_by_code",
      { p_code: c, p_business_id: business.id });
    if (memData && memData.length > 0) {
      setMember(memData[0] as Member);
      setMode("idle");
      return;
    }

    // 2. Try as a redemption code (7 alphanumeric)
    const { data: redData } = await supabase.rpc("resolve_redemption_by_code",
      { p_code: c, p_business_id: business.id });
    if (redData && redData.length > 0) {
      setRedemption(redData[0] as RedemptionLookup);
      setMode("idle");
      return;
    }

    // 3. CP-36b: try as a saved-gift code (7 alphanumeric too). When the
    //    cp36 SQL is applied, customers can present a saved-offer QR and
    //    the front desk fulfills it via fulfill_saved_offer.
    const { data: giftData } = await supabase.rpc("resolve_saved_offer_by_code",
      { p_code: c, p_business_id: business.id });
    if (giftData && giftData.length > 0) {
      const g = giftData[0] as { saved_id: string; title: string; fulfilled_at: string | null };
      if (g.fulfilled_at) {
        setErr(`Gift "${g.title}" was already redeemed.`);
      } else if (confirm(`Fulfill gift: "${g.title}"?`)) {
        const { error: fulfillErr } = await supabase.rpc("fulfill_saved_offer", { p_saved_id: g.saved_id });
        if (fulfillErr) setErr(`Couldn't fulfill — ${fulfillErr.message}`);
        else { setMode("idle"); router.refresh(); return; }
      }
      setMode("idle");
      return;
    }

    setErr(`No member, redemption, or gift found with code "${c}".`);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Routed views
  if (member) {
    return (
      <AwardPointsPanel
        business={business}
        member={member}
        onClose={() => { setMember(null); router.refresh(); }}
      />
    );
  }
  if (redemption) {
    return (
      <RedemptionFulfillPanel
        business={business}
        redemption={redemption}
        onClose={() => { setRedemption(null); router.refresh(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* CP-30: USB QR scanner support — invisible auto-focused input that
          catches HID-class scanner keystrokes and runs resolveCode. No
          UI footprint; works on every tab. */}
      <ScannerListener
        enabled={tab === "desk"}
        onScan={(code) => resolveCode(code)}
      />
      <header className="bg-white border-b">
        <div className="max-w-2xl lg:max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={business.logo_url} alt="" className="h-8" />
            ) : (
              <div className="h-8 px-3 rounded-full flex items-center text-white text-xs font-bold"
                style={{ background: business.brand_colors.primary }}>{business.name[0]}</div>
            )}
            <div>
              <div className="text-sm font-bold">{business.name}</div>
              {/* CP-42 fix: was hardcoded to "Front desk" for every role —
                  misleading for agency_admin / manager viewers. Surface
                  the actual role so it matches what the user can do. */}
              <div className="text-[10px] text-muted-foreground tracking-wider uppercase">
                {role === "agency_admin"
                  ? "Agency admin"
                  : role === "business_manager"
                  ? "Manager"
                  : role === "business_staff"
                  ? "Front desk"
                  : "Manage"}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1"/>Sign out</Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-2xl lg:max-w-7xl mx-auto px-2 flex overflow-x-auto">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap",
                tab === t.id
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
          {bizSavedAt && (
            <span className="ml-auto self-center text-[11px] text-emerald-600 flex items-center gap-1 pr-2">
              <Check className="h-3 w-3"/> Saved
            </span>
          )}
        </div>
      </div>

      <main className="max-w-2xl lg:max-w-7xl mx-auto p-4 space-y-4">
        {tab === "desk" && (
          <>
            {/* CP-42: hard-to-cancel value strip. Sits at the very top so
                it's the first thing the manager sees every shift. */}
            <AtlasValueStrip
              businessId={business.id}
              primary={business.brand_colors.primary}
              secondary={business.brand_colors.secondary}
            />

            {/* CP-30: live recap card. Hides itself if the CP-30 SQL isn't
                installed yet — page still works either way. */}
            <DailyRecapCard
              businessId={business.id}
              businessName={business.name}
              primary={business.brand_colors.primary}
              secondary={business.brand_colors.secondary}
            />

            {/* CP-30: customer search bar. Open AwardPointsPanel directly
                on pick. Lives above the scan hero so it's the first thing
                staff reach for. */}
            <CustomerSearch
              businessId={business.id}
              primary={business.brand_colors.primary}
              onPick={(h) => {
                setMember({
                  membership_id: h.membership_id,
                  user_id: h.user_id,
                  full_name: h.full_name,
                  email: h.email,
                  phone: h.phone,
                  points_balance: h.points_balance,
                  tier: h.tier,
                  joined_at: h.joined_at,
                  visit_count: h.visit_count,
                });
              }}
            />

            {/* Hero CTA — CP-42: bigger title, glowing CTA, decorative
                blobs, brighter accent for the action buttons. */}
            <div
              className="rounded-3xl p-6 text-white relative overflow-hidden shadow-xl"
              style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
            >
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-black/15 blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full mb-2">
                  <ScanLine className="h-3 w-3" /> Front desk · live
                </div>
                <h1 className="text-2xl font-black drop-shadow-sm">Scan to start</h1>
                <p className="text-sm text-white/90 mt-1.5 leading-snug">
                  Scan a member's QR to award points, or scan a reward code to deliver a redemption.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <Button
                    onClick={() => setMode("scanning")}
                    className="bg-white text-zinc-900 hover:bg-zinc-100 h-12 font-extrabold text-base shadow-lg"
                  >
                    <ScanLine className="h-5 w-5 mr-2"/> Scan code
                  </Button>
                  <Button
                    onClick={() => setMode("code-entry")}
                    className="bg-white/15 backdrop-blur-sm border border-white/40 text-white hover:bg-white/25 h-12 font-extrabold text-base"
                  >
                    <UserSearch className="h-5 w-5 mr-2"/> Type code
                  </Button>
                </div>
                <div className="mt-3.5 grid grid-cols-3 gap-3 text-[11px] text-white/90 font-medium">
                  <div className="flex items-center gap-1.5"><ScanLine className="h-3.5 w-3.5"/> 6-char = member</div>
                  <div className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5"/> 7-char = redemption</div>
                  {/* CP-30: USB scanner status indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    USB scanner ready
                  </div>
                </div>
              </div>
            </div>

            {/* Scanner panel */}
            {mode === "scanning" && (
              <div className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Point your camera at the QR</h3>
                  <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>Cancel</Button>
                </div>
                <QrScanner onScan={(value) => resolveCode(value)} />
                {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
              </div>
            )}

            {/* Manual code entry — CP-30: larger touch targets and clearer
                empty/error states for live front-desk use. */}
            {mode === "code-entry" && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-base">Type the code</h3>
                  <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>Cancel</Button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); resolveCode(code); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                      Member or redemption code
                    </Label>
                    <Input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      placeholder="ABC123 or A2B3C4D"
                      maxLength={8}
                      autoFocus
                      // CP-30: noticeably larger input — easier to type into on
                      // a tablet at the front desk without misfiring.
                      className="font-mono tracking-[0.4em] text-2xl text-center uppercase h-14"
                    />
                    <p className="text-[11px] text-zinc-500 text-center">
                      6 chars for member, 7 for redemption. Letters and numbers only.
                    </p>
                  </div>
                  {err && (
                    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                      {err}
                    </div>
                  )}
                  <Button type="submit" className="w-full h-12 text-base font-bold">
                    Look up
                  </Button>
                </form>
              </div>
            )}

            <ReviewQueue business={business} />

            {/* CP-34: pending memberships awaiting in-person / external-link
                payment confirmation. Self-hides when empty. */}
            <PendingMembershipsQueue business={business} />

            {/* Recent activity */}
            <div className="rounded-2xl border bg-white">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Recent activity</h3>
              </div>
              <div className="divide-y">
                {recent.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</div>
                ) : recent.map(r => {
                  // CP-42: avatar circle from initials makes the customer
                  // identity scannable at a glance.
                  const name = r.customer_name ?? "Guest";
                  const initials = name
                    .split(" ")
                    .map(s => s[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?";
                  return (
                    <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                        style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.primary}cc)` }}
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <span className="capitalize">{r.rule_type.replace(/_/g, " ")}</span>
                          <span className="opacity-50">•</span>
                          <span>{new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        </div>
                      </div>
                      <div className={r.delta >= 0 ? "text-emerald-600 font-bold shrink-0" : "text-rose-600 font-bold shrink-0"}>
                        {r.delta >= 0 ? "+" : ""}{r.delta} pts
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "insights" && <InsightsDashboard business={business} />}

        {tab === "offers" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-4 min-w-0">
              {/* Sub-tabs: One-Time / Automated */}
              <div className="flex rounded-xl bg-zinc-100 p-1 gap-1">
                <button
                  onClick={() => setOffersSubTab("one-time")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
                    offersSubTab === "one-time"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  One-Time offers
                </button>
                <button
                  onClick={() => setOffersSubTab("automated")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
                    offersSubTab === "automated"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  ✨ Automated
                </button>
              </div>

              {offersSubTab === "one-time"  && <OffersManager           business={business} />}
              {offersSubTab === "automated" && <AutomatedOffersManager  business={business} />}
            </div>

            {/* CP-35: live phone-frame preview, scoped to offers only.
                Hidden on small screens (front-desk tablets); visible on
                lg+ so the manager can see customer banner + featured
                offer change in real time as they edit. */}
            <ManagerOffersPreview business={business} />
          </div>
        )}

        {tab === "news"       && <NewsManager             business={business} />}
        {tab === "billing"    && <ManagerBilling         business={business} />}
        {tab === "membership" && <MembershipBillingSetup business={business} />}
        {tab === "team"       && (role === "business_manager" || role === "agency_admin") && (
          <TeamMembers
            businessId={business.id}
            callerRole={role}
            primary={business.brand_colors.primary}
          />
        )}
        {/* CP-36b: notifications surface (composer + toggles) moved to the
            agency admin's per-business settings. The manager dashboard no
            longer carries this tab — keeps the front-desk surface focused
            on day-to-day ops. */}
      </main>
    </div>
  );
}
