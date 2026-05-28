"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, QrCode, User, Palette, Tag, Crown, Gift, Settings as SettingsIcon, BarChart3, Newspaper } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, hexToHsl } from "@/lib/utils";
import { INDUSTRY_PRESETS, type Business } from "@/lib/types/database";
import { CustomerPreview, type PreviewTab, type PreviewOffer, type PreviewReward, type PreviewNewsPost } from "@/components/customer-preview/customer-preview";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { ImageUploader } from "@/components/agency/image-uploader";
import { RewardsManager } from "@/components/agency/rewards-manager";
import { MysteryPoolManager } from "@/components/agency/mystery-pool-manager";
import { StreakConfigEditor } from "@/components/agency/streak-config-editor";
import { BusinessInsights } from "@/components/agency/business-insights";
import { WebhookSettings } from "@/components/agency/webhook-settings";
import { AutomationRulesEditor } from "@/components/agency/automation-rules-editor";
import { BusinessDiscoveryQR } from "@/components/agency/business-discovery-qr";
import { OffersManager } from "@/components/agency/offers-manager";
import { AutomatedOffersManager } from "@/components/agency/automated-offers-manager";
import { MembershipEditor } from "@/components/agency/membership-editor";
import { NewsManager } from "@/components/agency/news-manager";
// Products manager removed — Atlas is loyalty-only now (no in-app commerce).
import { TemplateApplyPanel } from "@/components/agency/template-apply-panel";
import { WidgetToggleGroups } from "@/components/agency/widget-toggle-groups";
import { BookingTagsManager } from "@/components/agency/booking-tags-manager";
import { BusinessSettingsPanel } from "@/components/agency/business-settings-panel";
import { CalendarClock } from "lucide-react";
import type { IndustryTemplate } from "@/lib/industry-templates";
import type { PreviewBookingTag } from "@/components/customer-preview/customer-preview";

const WIDGET_LABELS: Record<string, string> = {
  points_card:   "Main points card",
  rewards_store: "Rewards store",
  referrals:     "Referrals",
  reviews:       "Review rewards",
  birthdays:     "Birthday bonus",
  visit_tracker: "Visit tracker",
  booking_cta:   "Booking CTA",
  offers:        "Offers & promos",
  leaderboard:   "Leaderboard",
  push:          "Push notifications",
  sms:           "SMS campaigns",
};

const POINT_LABELS: Record<string, string> = {
  first_visit_bonus:   "Sign-up reward",
  referral_referrer:   "Referral reward (to referrer)",
  referral_referee:    "Referral reward (to new member)",
  review:              "Google Review reward",
  visit:               "Check-in reward (per visit)",
  purchase_per_dollar: "Purchase reward per $ spent",
  birthday:            "Birthday bonus",
  social_follow:       "Social follow reward",
  profile_complete:    "Profile complete bonus",
};

// Reasonable max values per rule so the slider feels natural
const POINT_MAXES: Record<string, number> = {
  first_visit_bonus:   500,
  referral_referrer:   1000,
  referral_referee:    500,
  review:              500,
  visit:               200,
  purchase_per_dollar: 20,
  birthday:            1000,
  social_follow:       200,
  profile_complete:    500,
};

type Tab = "brand" | "insights" | "offers" | "membership" | "rewards" | "news" | "settings";

function tabsFor(b: Business): { id: Tab; label: string; icon: React.ReactNode }[] {
  const all: { id: Tab; label: string; icon: React.ReactNode; gatedBy?: keyof Business["widget_config"] }[] = [
    { id: "brand",      label: "Brand & widgets", icon: <Palette className="h-4 w-4" /> },
    { id: "rewards",    label: "Rewards",         icon: <Gift className="h-4 w-4" /> },
    { id: "offers",     label: "Offers",          icon: <Tag className="h-4 w-4" /> },
    // Booking, Products, and Leaderboard tabs removed — Atlas is loyalty-only.
    { id: "membership", label: "Membership",      icon: <Crown className="h-4 w-4" /> },
    { id: "news",       label: "News",            icon: <Newspaper className="h-4 w-4" />,     gatedBy: "news" },
    { id: "insights",   label: "Insights",        icon: <BarChart3 className="h-4 w-4" /> },
    { id: "settings",   label: "Settings",        icon: <SettingsIcon className="h-4 w-4" /> },
  ];
  return all.filter(t => !t.gatedBy || b.widget_config[t.gatedBy]);
}

export function BrandEditor({ initial }: { initial: Business }) {
  const [b, setB] = useState<Business>(initial);
  const [tab, setTab] = useState<Tab>("brand");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("home");
  const [saving, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [previewRewards, setPreviewRewards] = useState<PreviewReward[]>([]);
  const [previewOffer, setPreviewOffer]     = useState<PreviewOffer | null>(null);
  const [previewNews, setPreviewNews]       = useState<PreviewNewsPost[]>([]);
  const [previewBookingTags, setPreviewBookingTags] = useState<PreviewBookingTag[]>([]);
  // CP-21: Mirror the One-Time / Automated split that already lives in the
  // manager dashboard so the agency side has the same Dermis-style segmented
  // control instead of stacking both managers vertically.
  const [offersSubTab, setOffersSubTab] = useState<"one-time" | "automated">("one-time");
  // CP-22: bumps on offer save/delete/feature so the preview-data effect
  // refetches and the live preview reflects what the agency just did,
  // without having to hit Save business or refresh the page.
  const [previewRefreshTick, setPreviewRefreshTick] = useState(0);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  function update<K extends keyof Business>(k: K, v: Business[K]) {
    setB(prev => ({ ...prev, [k]: v }));
  }

  function patch(p: Partial<Business>) {
    setB(prev => ({ ...prev, ...p }));
  }

  // Load live data for the phone preview so the agency sees what the customer sees.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [{ data: rwd }, { data: off }, { data: nws }, { data: btg }] = await Promise.all([
        supabase.from("rewards").select("id,name,point_cost,image_url")
          .eq("business_id", b.id).eq("is_active", true)
          .order("sort_order").order("point_cost").limit(4),
        supabase.from("offers").select("title,description,image_url,expires_at")
          .eq("business_id", b.id).eq("is_active", true).eq("is_featured", true)
          .limit(1).maybeSingle(),
        supabase.from("news_posts").select("id,title,body,image_url,published_at")
          .eq("business_id", b.id).eq("is_published", true)
          .order("published_at", { ascending: false }).limit(3),
        supabase.from("booking_tags").select("id,name,emoji,duration_minutes,price_cents,image_url")
          .eq("business_id", b.id).eq("is_active", true)
          .order("sort_order").limit(6),
      ]);

      if (cancelled) return;
      setPreviewRewards((rwd ?? []) as PreviewReward[]);
      setPreviewNews((nws ?? []) as PreviewNewsPost[]);
      setPreviewBookingTags((btg ?? []) as PreviewBookingTag[]);
      if (off) {
        const days_left = off.expires_at
          ? Math.max(0, Math.ceil((new Date(off.expires_at).getTime() - Date.now()) / 86_400_000))
          : undefined;
        setPreviewOffer({
          title: off.title, description: off.description,
          image_url: off.image_url, days_left,
        });
      } else {
        setPreviewOffer(null);
      }
    })();

    return () => { cancelled = true; };
  }, [b.id, savedAt, previewRefreshTick]);

  function save() {
    startSave(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("businesses")
        .update({
          name: b.name, industry: b.industry, logo_url: b.logo_url,
          hero_image_url: b.hero_image_url,
          membership_image_url: b.membership_image_url,
          brand_colors: b.brand_colors, welcome_message: b.welcome_message,
          contact_info: b.contact_info, google_review_url: b.google_review_url,
          widget_config: b.widget_config, point_rules: b.point_rules,
          tiers: b.tiers, services: b.services,
        })
        .eq("id", b.id);
      if (!error) setSavedAt(new Date());
      else alert("Save failed: " + error.message);
    });
  }

  const previewStyle = {
    "--brand-primary":   hexToHsl(b.brand_colors.primary),
    "--brand-secondary": hexToHsl(b.brand_colors.secondary),
    "--brand-accent":    hexToHsl(b.brand_colors.accent),
  } as React.CSSProperties;

  return (
    <div>
      {/* Header */}
      <header className="flex items-start justify-between px-8 pt-8 pb-4">
        <div className="flex items-start gap-3">
          <Link href="/agency"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4"/></Button></Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              Good evening {b.name} 👋
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              <code>{b.slug}.{rootDomain}</code> · {b.industry ?? "uncategorized"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="h-3 w-3"/> Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <a href={`http://${b.slug}.${rootDomain}:3000`} target="_blank">
            <Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-1"/>Customer app</Button>
          </a>
          <a href={`http://${b.slug}.${rootDomain}:3000/manage`} target="_blank">
            <Button variant="outline" size="sm" className="border-sky-300 text-sky-700 hover:bg-sky-50">
              <User className="h-4 w-4 mr-1"/>Front desk
            </Button>
          </a>
          <Button onClick={save} disabled={saving} className="bg-zinc-900 hover:bg-zinc-800 text-white">
            <QrCode className="h-4 w-4 mr-2"/> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-8 border-b">
        <nav className="flex gap-1 -mb-px">
          {tabsFor(b).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                tab === t.id
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* CP-26: Insights / Membership / Settings tabs are 100% dedicated to
          their content — no phone preview rail on those tabs. Brand /
          Rewards / Offers / News still get the live preview because they
          edit things that visibly change the customer app. */}
      {(() => null)()}

      {/* Body */}
      <div
        className={cn(
          "px-8 py-8 grid gap-8",
          tab === "insights" || tab === "membership" || tab === "settings"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[1fr_400px]",
        )}
      >
        {/* LEFT — editor */}
        <div className="space-y-6 min-w-0">
          {tab === "brand" && (
            <>
              <Section title="Business info" subtitle="The basics that show up across every screen.">
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Business name">
                    <Input value={b.name} onChange={e => update("name", e.target.value)} />
                  </Field>
                  <Field label="Industry">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={b.industry ?? ""}
                      onChange={e => update("industry", e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {INDUSTRY_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Welcome message">
                  <Input value={b.welcome_message ?? ""} onChange={e => update("welcome_message", e.target.value)} placeholder="Welcome! Earn points every visit." />
                </Field>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Logo">
                    <ImageUploader
                      bucket="business-logos"
                      pathPrefix={b.id}
                      value={b.logo_url}
                      onChange={(url) => update("logo_url", url)}
                      label="Logo"
                      aspectClass="aspect-square"
                    />
                  </Field>
                  <Field label="Hero image (customer home tab background)">
                    <ImageUploader
                      bucket="business-heroes"
                      pathPrefix={b.id}
                      value={b.hero_image_url}
                      onChange={(url) => update("hero_image_url", url)}
                      label="Hero"
                      aspectClass="aspect-square"
                    />
                  </Field>
                </div>
                <Field label="Google review URL">
                  <Input value={b.google_review_url ?? ""} onChange={e => update("google_review_url", e.target.value)} placeholder="https://g.page/…/review" />
                </Field>
              </Section>

              <Section title="Brand colors" subtitle="The customer app re-themes around these in real time.">
                <div className="grid md:grid-cols-3 gap-4">
                  {(["primary","secondary","accent"] as const).map(key => (
                    <div key={key} className="space-y-2">
                      <Label className="capitalize text-xs text-muted-foreground">{key}</Label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={b.brand_colors[key]}
                          onChange={e => update("brand_colors", { ...b.brand_colors, [key]: e.target.value })}
                          className="h-10 w-12 rounded border cursor-pointer"/>
                        <Input value={b.brand_colors[key]}
                          onChange={e => update("brand_colors", { ...b.brand_colors, [key]: e.target.value })}/>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Customer-app features" subtitle="Turn features on or off — the customer app re-shapes its tabs and Home layout to match.">
                <WidgetToggleGroups
                  config={b.widget_config}
                  onChange={(next) => update("widget_config", next)}
                />
              </Section>

              <TemplateApplyPanel
                business={b}
                onApply={(tpl: IndustryTemplate) => {
                  patch({
                    industry: tpl.value === "other" ? b.industry : tpl.value,
                    widget_config: tpl.widget_config,
                    point_rules:   tpl.point_rules,
                  });
                }}
              />

              <BusinessDiscoveryQR business={b} />
            </>
          )}

          {tab === "rewards" && (
            <>
              <Section title="Points configurations" subtitle="How many points each action earns. Drag the slider or type a value.">
                <div className="space-y-5">
                  {Object.entries(POINT_LABELS).map(([key, label]) => (
                    <PointSlider
                      key={key}
                      label={label}
                      value={(b.point_rules as Record<string, number>)[key] ?? 0}
                      max={POINT_MAXES[key] ?? 500}
                      onChange={(v) => update("point_rules", { ...b.point_rules, [key]: v })}
                      color={b.brand_colors.primary}
                    />
                  ))}
                </div>
              </Section>

              <RewardsManager business={b} />
              <MysteryPoolManager business={b} />
              <StreakConfigEditor business={b} />
            </>
          )}

          {tab === "insights"   && <BusinessInsights business={b} />}
          {tab === "offers"     && (
            <div className="space-y-4">
              {/* Dermis-style segmented control — matches manager-dashboard.tsx exactly */}
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
                  ✨ Automated Offers
                </button>
              </div>

              {offersSubTab === "one-time"  && (
                <OffersManager
                  business={b}
                  onChange={() => setPreviewRefreshTick(t => t + 1)}
                />
              )}
              {offersSubTab === "automated" && <AutomatedOffersManager business={b} />}
            </div>
          )}
          {tab === "membership" && <MembershipEditor business={b} onUpdate={patch} />}
          {tab === "news"       && <NewsManager business={b} />}
          {tab === "settings"   && (
            <div className="space-y-6">
              <BusinessSettingsPanel business={b} onUpdate={patch} />
              <WebhookSettings business={b} />
              <AutomationRulesEditor business={b} />
            </div>
          )}
        </div>

        {/* RIGHT — phone-frame preview (CP-26: only on tabs that change the
            customer-app visuals; CP-29.1: also hidden on Offers since the
            new automated-offer edit panel ships its own popup preview that
            shows the actual customer experience). */}
        {tab !== "insights" && tab !== "membership" && tab !== "settings" && tab !== "offers" && (
          <div className="lg:sticky lg:top-8 lg:self-start" style={previewStyle}>
            <div className="text-center mb-3">
              <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Live preview</div>
              <div className="text-xs text-muted-foreground mt-1">Tap the bottom tabs to switch screens</div>
            </div>
            <PhoneFrame>
              <CustomerPreview
                business={b}
                activeTab={previewTab}
                onTabChange={setPreviewTab}
                rewards={previewRewards}
                offer={previewOffer}
                news={previewNews}
                membershipImageUrl={b.membership_image_url}
              />
            </PhoneFrame>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-4">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PointSlider({
  label, value, max, onChange, color,
}: { label: string; value: number; max: number; onChange: (v: number) => void; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-zinc-900">{label}</div>
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <div className="h-1.5 rounded-full bg-zinc-200" />
          <div
            className="h-1.5 rounded-full absolute top-0 left-0"
            style={{ width: `${pct}%`, background: color }}
          />
          <input
            type="range"
            min={0}
            max={max}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
            style={{ accentColor: color }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white border-2 shadow"
            style={{ left: `calc(${pct}% - 8px)`, borderColor: color }}
          />
        </div>
        <div className="flex items-center gap-2 w-32 shrink-0">
          <Input
            type="number"
            value={value}
            min={0}
            max={max}
            onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
            className="h-9 text-sm text-center"
          />
          <span className="text-xs text-muted-foreground">points</span>
        </div>
      </div>
    </div>
  );
}
