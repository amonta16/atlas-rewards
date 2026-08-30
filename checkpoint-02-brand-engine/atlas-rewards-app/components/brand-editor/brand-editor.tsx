"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, QrCode, User, Palette, Tag, Crown, Gift, Settings as SettingsIcon, BarChart3, Newspaper } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, hexToHsl, businessUrl } from "@/lib/utils";
import { INDUSTRY_PRESETS, type Business } from "@/lib/types/database";
import { PATTERN_OPTIONS, patternStyle } from "@/lib/patterns";
import { BANNER_OPTIONS, bannerStyle } from "@/lib/banner-styles";
import { CARD_STYLES, BUTTON_STYLES, designVars } from "@/lib/design-styles";
// CP-65: one-click theme presets + themable streak.
import { THEME_PRESETS, presetPatch } from "@/lib/theme-presets";
import { STREAK_THEMES, resolveStreakTheme, streakGradient } from "@/lib/streak-themes";
import { STREAK_PAGE_THEMES, resolveStreakPage } from "@/lib/streak-page-themes";
// CP-65.1: poppy offer-card styles.
import { OFFER_CARD_STYLES, offerCardStyle } from "@/lib/offer-card-styles";
// CP-99: reward-store panel presets.
import { REWARD_CARD_STYLES, rewardCardChrome } from "@/lib/reward-card-styles";
// CP-73: Home points-card presets (classic/shiny/fun/sleek/simple).
import { POINTS_CARD_STYLES, pointsCardStyle } from "@/lib/points-card-styles";
// CP-66: section layout presets (rewards store + limited offers).
import { OFFERS_LAYOUTS, REWARDS_LAYOUTS, SAVED_GIFTS_LAYOUTS } from "@/lib/section-layouts";
// CP-67: element pack (badges, headings, dividers, CTA glow).
import { BADGE_STYLES, HEADING_STYLES, DIVIDER_STYLES, CTA_GLOWS, badgeCss } from "@/lib/element-styles";
// CP-68: reward game presets — CP-72: picker removed, every business plays
// the Prize Wheel. Prize/odds config moved to the Rewards tab
// (MysteryPoolManager below).
import { CustomerPreview, type PreviewTab, type PreviewOffer, type PreviewReward, type PreviewNewsPost } from "@/components/customer-preview/customer-preview";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { ImageUploader } from "@/components/agency/image-uploader";
import { RewardsManager } from "@/components/agency/rewards-manager";
// CP-72: MysteryPoolManager is BACK (CP-42 removed it) — Andrew wants the
// wheel's prizes + odds configurable, and the wheel wedges now display the
// real pool, so owners need a place to shape it. It lives on the Rewards
// tab (not Brand/Widgets) per Andrew's call.
import { MysteryPoolManager } from "@/components/agency/mystery-pool-manager";
import { StreakConfigEditor } from "@/components/agency/streak-config-editor";
import { BusinessInsights } from "@/components/agency/business-insights";
// CP-37.12: WebhookSettings + AutomationRulesEditor removed from the
// agency Settings tab. Neither was wired to anything production-facing
// yet — Andrew wanted them out so settings stays focused on what's
// actually shipping. Components remain in the repo for when we bring
// them back.
import { BusinessDiscoveryQR } from "@/components/agency/business-discovery-qr";
import { OffersManager } from "@/components/agency/offers-manager";
import { AutomatedOffersManager } from "@/components/agency/automated-offers-manager";
import { MembershipEditor } from "@/components/agency/membership-editor";
// CP-87: the SAME payments / plans & passes setup the manager dashboard
// has (CP-34 payment modes + CP-86 duration passes) — parity for admins.
import { MembershipBillingSetup } from "@/components/manager/membership-billing-setup";
// CP-87: manager-only announcement composer, surfaced for admins here too.
import { AnnouncementComposer } from "@/components/manager/announcement-composer";
import { NewsManager } from "@/components/agency/news-manager";
// Products manager removed — Atlas is loyalty-only now (no in-app commerce).
// CP-42: TemplateApplyPanel removed — industry template only applied during create.
import { WidgetToggleGroups } from "@/components/agency/widget-toggle-groups";
import { BookingTagsManager } from "@/components/agency/booking-tags-manager";
import { BusinessSettingsPanel } from "@/components/agency/business-settings-panel";
import { NotificationSettingsPanel } from "@/components/agency/notification-settings-panel";
import { CalendarClock } from "lucide-react";
// CP-42: IndustryTemplate import removed alongside TemplateApplyPanel.
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
  // CP-45: the mockup preview kept drifting from the real customer app
  // (hard-coded demo values, missing newer features) and Andrew read that
  // as "the preview is broken / not synced". Live mode frames the ACTUAL
  // customer app, so every tab, widget toggle, and saved setting renders
  // exactly as customers see it. Mock stays for instant unsaved color edits.
  const [previewMode, setPreviewMode] = useState<"live" | "mock">("live");
  // Bumped on save so the live iframe reloads with fresh settings.
  const [liveReloadKey, setLiveReloadKey] = useState(0);
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
          /* CP-38: dedicated square app icon (separate from logo so
             horizontal logos don't get squished as PWA icons). */
          app_icon_url: (b as any).app_icon_url ?? null,
          hero_image_url: b.hero_image_url,
          membership_image_url: b.membership_image_url,
          brand_colors: b.brand_colors, welcome_message: b.welcome_message,
          contact_info: b.contact_info, google_review_url: b.google_review_url,
          widget_config: b.widget_config, point_rules: b.point_rules,
          tiers: b.tiers, services: b.services,
          /* CP-52: faint background pattern for the customer app. */
          background_pattern: b.background_pattern ?? "none",
          /* CP-57: custom pattern tint. */
          pattern_color: b.pattern_color ?? null,
          /* CP-54: customizable header + page (surface) colors. */
          header_color: b.header_color ?? null,
          surface_color: b.surface_color ?? null,
          /* CP-56: featured-offer banner style. */
          banner_style: b.banner_style ?? null,
          /* CP-58: card + button design styles. */
          card_style: b.card_style ?? null,
          button_style: b.button_style ?? null,
          /* CP-65: streak surface theme. */
          streak_theme: b.streak_theme ?? null,
          /* CP-99: streak page environment color + pattern. */
          streak_env_color: b.streak_env_color ?? null,
          streak_env_pattern: b.streak_env_pattern ?? null,
          streak_progress_mode: b.streak_progress_mode ?? null,
          /* CP-99 simplified: the one streak page-theme choice. */
          streak_page_theme: b.streak_page_theme ?? null,
          /* CP-65.1: customer offer-card style. */
          offer_card_style: b.offer_card_style ?? null,
          /* CP-99: reward-store panel style. */
          reward_card_style: b.reward_card_style ?? null,
          /* CP-99: location/map band color (Home bottom). */
          location_card_color: b.location_card_color ?? null,
          /* CP-66: section layout presets. */
          rewards_layout: b.rewards_layout ?? null,
          offers_layout: b.offers_layout ?? null,
          /* CP-99: home top-rewards + saved-gifts layouts. */
          home_rewards_layout: b.home_rewards_layout ?? null,
          saved_gifts_layout: b.saved_gifts_layout ?? null,
          /* CP-67: element pack. */
          badge_style: b.badge_style ?? null,
          heading_style: b.heading_style ?? null,
          divider_style: b.divider_style ?? null,
          cta_glow: b.cta_glow ?? null,
          /* CP-68: reward game + demo flag. */
          reward_game: b.reward_game ?? null,
          is_demo: b.is_demo ?? false,
          /* CP-73: Home points-card design preset. */
          points_card_style: b.points_card_style ?? null,
        })
        .eq("id", b.id);
      if (!error) {
        setSavedAt(new Date());
        // CP-45: refresh the live preview so the saved settings show up.
        setLiveReloadKey(k => k + 1);
      }
      else alert("Save failed: " + error.message);
    });
  }

  const previewStyle = {
    "--brand-primary":   hexToHsl(b.brand_colors.primary),
    "--brand-secondary": hexToHsl(b.brand_colors.secondary),
    "--brand-accent":    hexToHsl(b.brand_colors.accent),
    // CP-58: expose the card/button tokens on the preview wrapper too, so the
    // outlined-card ring (which reads --brand-primary) resolves correctly.
    ...designVars(b.card_style, b.button_style, b.cta_glow, b.brand_colors.primary),
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
          {/* CP-37.19 — link to same-host path-based URLs instead of
              subdomain URLs. The agency admin's session cookie is set
              on app.atlas-engine.app — it doesn't carry over to a
              different subdomain like slug.atlas-engine.app, which
              meant the new tab landed on the customer login first,
              then dumped them on the customer view after sign-in.
              Path-based same-host URLs share the session immediately
              and land directly on /manage. */}
          <a href={`/${b.slug}/app`} target="_blank">
            <Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-1"/>Customer app</Button>
          </a>
          <a href={`/${b.slug}/manage`} target="_blank">
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
                <div className="grid md:grid-cols-3 gap-4">
                  <Field label="Logo">
                    <ImageUploader
                      bucket="business-logos"
                      pathPrefix={b.id}
                      value={b.logo_url}
                      onChange={(url) => update("logo_url", url)}
                      label="Logo"
                      aspectClass="aspect-square"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
                      Used in the customer app header + agency dashboard. Any shape works.
                    </p>
                  </Field>
                  {/* CP-38: dedicated square app icon. Without this, the
                      home-screen icon on a phone uses the regular logo
                      which can get squished if it's not square. */}
                  <Field label="App icon (home screen)">
                    <ImageUploader
                      bucket="business-logos"
                      pathPrefix={`${b.id}/app-icon`}
                      value={b.app_icon_url ?? null}
                      onChange={(url) => update("app_icon_url" as any, url as any)}
                      label="App icon"
                      aspectClass="aspect-square"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
                      <strong>Square PNG, 512×512+.</strong> What shows up on customers' phone home screens. If empty, we fall back to the logo (may look squished).
                    </p>
                  </Field>
                  <Field label="Hero image (home background)">
                    <ImageUploader
                      bucket="business-heroes"
                      pathPrefix={b.id}
                      value={b.hero_image_url}
                      onChange={(url) => update("hero_image_url", url)}
                      label="Hero"
                      aspectClass="aspect-square"
                      library={{ category: "hero", industry: b.industry }}
                    />
                    <p className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
                      Landscape photo of your space (1600×900+). Shown behind the welcome message.
                    </p>
                  </Field>
                </div>
                <Field label="Google review URL">
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
                </Field>
              </Section>

              {/* CP-65: one-click theme presets. Sets EVERY design lever at
                  once (colors, header/bg, pattern, card + button shapes,
                  banner, streak theme) — then anything can be tweaked below.
                  Nothing saves until the Save button, so trying looks is free. */}
              <Section title="Theme presets" subtitle="One click sets the whole look — colors, background, patterns, card & button style, and streak theme. Fine-tune anything below afterwards.">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {THEME_PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => patch(presetPatch(p))}
                      className="rounded-xl border-2 border-zinc-200 hover:border-zinc-400 overflow-hidden text-left transition group"
                      title={p.blurb}
                    >
                      {/* palette strip */}
                      <div className="h-9 flex">
                        <div className="flex-1" style={{ background: p.brand_colors.primary }} />
                        <div className="flex-1" style={{ background: p.brand_colors.secondary }} />
                        <div className="flex-1" style={{ background: p.brand_colors.accent }} />
                        <div className="flex-1 border-l border-black/5" style={{ background: p.surface_color ?? "#ffffff" }} />
                      </div>
                      <div className="px-2 py-1.5">
                        <div className="text-[11px] font-extrabold text-zinc-800 truncate">
                          {p.emoji} {p.label}
                        </div>
                        <div className="text-[9px] text-zinc-500 truncate">
                          {p.greatFor.join(" · ")}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Presets are starting points — they instantly restyle the live preview on the right. Hit <strong>Save</strong> only when you like it.
                </p>
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

              <Section title="Background pattern" subtitle="A faint tiled texture behind the customer app — pick one that fits the vibe, or none.">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {PATTERN_OPTIONS.map(opt => {
                    const selected = (b.background_pattern ?? "none") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("background_pattern", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-1.5 text-center transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        <div
                          className="h-12 w-full rounded-lg border border-zinc-100 flex items-center justify-center text-lg"
                          style={patternStyle(opt.id, b.pattern_color ?? b.brand_colors.primary, b.logo_url, b.brand_colors.secondary, b.brand_colors.accent)}
                        >
                          {opt.id === "none" ? "" : opt.emoji}
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* CP-57: pattern tint — defaults to the brand primary. */}
                {(b.background_pattern ?? "none") !== "none" && (
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <Label className="text-xs text-muted-foreground">Pattern color</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={b.pattern_color ?? b.brand_colors.primary}
                        onChange={e => update("pattern_color", e.target.value)}
                        className="h-9 w-11 rounded border cursor-pointer" />
                      <Input className="w-36" value={b.pattern_color ?? ""} placeholder="brand color (default)"
                        onChange={e => update("pattern_color", e.target.value || null)} />
                    </div>
                    {b.pattern_color && (
                      <Button type="button" variant="outline" size="sm" onClick={() => update("pattern_color", null)}>
                        Reset
                      </Button>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Header & background" subtitle="Pick the header bar + page color (e.g. a dark mode). Content cards stay white and headings auto-adjust, so text never blends.">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => patch({ header_color: null, surface_color: null })}>
                    ☀️ Light (default)
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => patch({ header_color: "#0f172a", surface_color: "#0b1220" })}>
                    🌙 Dark
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => patch({ header_color: b.brand_colors.primary, surface_color: null })}>
                    🎨 Brand header
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Header color</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={b.header_color ?? "#ffffff"}
                        onChange={e => update("header_color", e.target.value)}
                        className="h-10 w-12 rounded border cursor-pointer" />
                      <Input value={b.header_color ?? ""} placeholder="#ffffff (default)"
                        onChange={e => update("header_color", e.target.value || null)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Background color</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={b.surface_color ?? "#faf9f7"}
                        onChange={e => update("surface_color", e.target.value)}
                        className="h-10 w-12 rounded border cursor-pointer" />
                      <Input value={b.surface_color ?? ""} placeholder="#ffffff (default)"
                        onChange={e => update("surface_color", e.target.value || null)} />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Leave blank for the default light look. Any background pattern you picked above still applies on top of this color.
                </p>
              </Section>

              <Section title="Card style" subtitle="How reward, stat, and offer cards look across the whole app — corners, shadow, and outline.">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {CARD_STYLES.map(opt => {
                    const selected = (b.card_style ?? "rounded") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("card_style", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-2 text-center transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        {/* Mini card demo — renders with this preset's real
                            tokens so the swatch shows the actual corners/shadow. */}
                        <div className="h-12 w-full bg-zinc-50 rounded-lg flex items-center justify-center p-2">
                          <div
                            className="h-full w-full bg-white flex items-center justify-center text-base"
                            style={{
                              ...opt.vars,
                              ["--brand-primary" as any]: hexToHsl(b.brand_colors.primary),
                              borderRadius: "var(--card-radius-md)",
                              boxShadow: "var(--card-shadow)",
                            }}
                          >
                            {opt.emoji}
                          </div>
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1.5 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-73: Home points-card design presets. */}
              <Section title="Points card style" subtitle="The look of the points strip on the customer Home page — shiny, fun, sleek, or keep it simple.">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {POINTS_CARD_STYLES.map(opt => {
                    const selected = (b.points_card_style ?? "classic") === opt.id;
                    const pc = pointsCardStyle(opt.id, b.brand_colors.primary, b.brand_colors.secondary, b.brand_colors.accent);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("points_card_style", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-2 text-center transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        {/* Mini live swatch — real preset styles, tiny scale. */}
                        <div className="h-12 w-full bg-zinc-100 rounded-lg flex items-center justify-center p-1.5">
                          <div
                            className="relative overflow-hidden h-full w-full rounded-md flex items-center gap-1.5 px-2"
                            style={pc.container}
                          >
                            {pc.shine && (
                              <div
                                className="absolute inset-0 pointer-events-none opacity-40"
                                style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 62%)" }}
                              />
                            )}
                            <span className="relative text-xs font-bold tabular-nums" style={{ color: pc.number }}>1,400</span>
                            <span className={cn("relative text-[8px] font-semibold", pc.dark ? "text-white/70" : "text-zinc-500")}>pts</span>
                          </div>
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1.5 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Button style" subtitle="The shape of every button and call-to-action in the customer app.">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {BUTTON_STYLES.map(opt => {
                    const selected = (b.button_style ?? "rounded") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("button_style", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-2 text-center transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        <div className="h-12 w-full bg-zinc-50 rounded-lg flex items-center justify-center px-2">
                          {/* Mini button demo in the brand primary color. */}
                          <div
                            className="h-7 px-4 flex items-center justify-center text-white text-[11px] font-bold"
                            style={{ background: b.brand_colors.primary, borderRadius: opt.radius }}
                          >
                            Button
                          </div>
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1.5 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Offer banner style" subtitle="The promo bar pinned to the top of every customer tab. Pick a look or a seasonal theme.">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {BANNER_OPTIONS.map(opt => {
                    const selected = (b.banner_style ?? "stripes") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("banner_style", opt.id)}
                        className={cn(
                          "rounded-xl border-2 overflow-hidden text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                      >
                        <div className="h-9 flex items-center gap-1.5 px-2 text-white text-[11px] font-bold overflow-hidden"
                          style={bannerStyle(opt.id, b.brand_colors.primary, b.brand_colors.secondary, b.brand_colors.accent)}>
                          <Tag className="h-3 w-3 shrink-0 drop-shadow" />
                          <span className="truncate drop-shadow">Featured offer</span>
                        </div>
                        <div className={cn("text-[10px] font-semibold px-2 py-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.emoji} {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-65.1: offer-card style — the "Limited offers" cards on the
                  customer Rewards tab. No more locked-in flat white. */}
              <Section title="Offer card style" subtitle="How the limited-offer cards on the customer Rewards tab look — pick a poppier treatment than plain white.">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {OFFER_CARD_STYLES.map(opt => {
                    const selected = (b.offer_card_style ?? "clean") === opt.id;
                    const css = offerCardStyle(opt.id, b.brand_colors.primary, b.brand_colors.secondary);
                    const dark = opt.dark;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("offer_card_style", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-1.5 text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        {/* mini offer-card mock */}
                        <div className="rounded-lg border overflow-hidden flex" style={css}>
                          <div className="w-8 shrink-0" style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary}30, ${b.brand_colors.secondary}15)` }} />
                          <div className="flex-1 min-w-0 p-1.5">
                            <div className={cn("text-[9px] font-extrabold truncate", dark ? "text-white" : "text-zinc-900")}>Free add-on</div>
                            <div className={cn("text-[7px] truncate", dark ? "text-white/60" : "text-zinc-500")}>This week only</div>
                            <span
                              className="inline-block mt-0.5 text-[6px] font-extrabold px-1 py-px rounded-full text-white"
                              style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})` }}
                            >
                              20% off
                            </span>
                          </div>
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.emoji} {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-99: reward-panel style — how the reward store CARDS look.
                  Same grammar as the offer-card picker above. */}
              <Section title="Reward panel style" subtitle="How the reward cards in the store look — from quiet classic to bold glow to dark luxe.">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {REWARD_CARD_STYLES.map(opt => {
                    const selected = (b.reward_card_style ?? "classic") === opt.id;
                    const readyCss  = rewardCardChrome(opt.id, b.brand_colors.primary, b.brand_colors.secondary, false);
                    const lockedCss = rewardCardChrome(opt.id, b.brand_colors.primary, b.brand_colors.secondary, true);
                    const dark = opt.dark;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("reward_card_style", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-1.5 text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        {/* mini store mock: one READY card + one locked card */}
                        <div className="grid grid-cols-2 gap-1">
                          {[readyCss, lockedCss].map((css, mi) => (
                            <div key={mi} className="rounded-lg border overflow-hidden bg-white" style={css}>
                              <div className="h-6" style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary}30, ${b.brand_colors.secondary}18)` }} />
                              <div className="p-1">
                                <div className={cn("text-[7px] font-extrabold truncate", dark ? "text-white" : "text-zinc-900")}>
                                  {mi === 0 ? "Free drink" : "Free tee"}
                                </div>
                                {mi === 0 ? (
                                  <span
                                    className="mt-0.5 block text-center text-[6px] font-black rounded text-white py-px"
                                    style={{ background: `linear-gradient(90deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})` }}
                                  >
                                    REDEEM
                                  </span>
                                ) : (
                                  <div className={cn("mt-1 h-0.5 rounded-full overflow-hidden", dark ? "bg-white/20" : "bg-zinc-100")}>
                                    <div className="h-full w-1/2 rounded-full" style={{ background: b.brand_colors.primary }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.emoji} {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-66: section layouts — the SHAPE of the two biggest
                  customer sections. Style pickers above choose the skin;
                  these choose the structure. */}
              <Section title="Rewards store layout" subtitle="How the Rewards store is arranged on the customer Rewards tab.">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {REWARDS_LAYOUTS.map(opt => {
                    const selected = (b.rewards_layout ?? "grid") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("rewards_layout", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-1.5 text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        {/* structural mini-mock */}
                        <div className="h-12 rounded-lg bg-zinc-50 border border-zinc-100 p-1 overflow-hidden">
                          {opt.id === "grid" && (
                            <div className="grid grid-cols-2 gap-1 h-full">
                              {[0,1].map(i => <div key={i} className="rounded" style={{ background: `${b.brand_colors.primary}30` }} />)}
                            </div>
                          )}
                          {opt.id === "list" && (
                            <div className="space-y-1 h-full">
                              {[0,1,2].map(i => <div key={i} className="h-[26%] rounded" style={{ background: `${b.brand_colors.primary}30` }} />)}
                            </div>
                          )}
                          {opt.id === "carousel" && (
                            <div className="flex gap-1 h-full">
                              {[0,1,2].map(i => <div key={i} className="w-2/5 shrink-0 rounded" style={{ background: `${b.brand_colors.primary}30` }} />)}
                            </div>
                          )}
                          {opt.id === "spotlight" && (
                            <div className="grid grid-cols-2 gap-1 h-full grid-rows-2">
                              <div className="col-span-2 rounded" style={{ background: `${b.brand_colors.primary}45` }} />
                              {[0,1].map(i => <div key={i} className="rounded" style={{ background: `${b.brand_colors.primary}25` }} />)}
                            </div>
                          )}
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.emoji} {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-99: the Home "Top rewards" section gets the same four
                  shapes as the store. */}
              <Section title="Home rewards layout" subtitle="How the Top rewards section is arranged on the customer Home page.">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {REWARDS_LAYOUTS.map(opt => {
                    const selected = (b.home_rewards_layout ?? "grid") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("home_rewards_layout", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-2 text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        <div className="text-lg">{opt.emoji}</div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-99: saved gifts get a shape too — stack / grid / carousel. */}
              <Section title="Saved gifts layout" subtitle="How “Your saved gifts” renders on the customer Rewards tab.">
                <div className="grid grid-cols-3 gap-2.5">
                  {SAVED_GIFTS_LAYOUTS.map(opt => {
                    const selected = (b.saved_gifts_layout ?? "stack") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("saved_gifts_layout", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-2 text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        <div className="text-lg">{opt.emoji}</div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Limited offers layout" subtitle="How offer cards are arranged on the customer Rewards tab.">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {OFFERS_LAYOUTS.map(opt => {
                    const selected = (b.offers_layout ?? "stack") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => update("offers_layout", opt.id)}
                        className={cn(
                          "rounded-xl border-2 p-1.5 text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={opt.hint}
                      >
                        <div className="h-12 rounded-lg bg-zinc-50 border border-zinc-100 p-1 overflow-hidden">
                          {opt.id === "stack" && (
                            <div className="space-y-1 h-full">
                              {[0,1].map(i => (
                                <div key={i} className="h-[46%] rounded flex overflow-hidden">
                                  <div className="w-1/4" style={{ background: `${b.brand_colors.primary}45` }} />
                                  <div className="flex-1" style={{ background: `${b.brand_colors.primary}20` }} />
                                </div>
                              ))}
                            </div>
                          )}
                          {opt.id === "coupon" && (
                            <div className="h-full rounded border border-dashed flex overflow-hidden" style={{ borderColor: `${b.brand_colors.primary}70` }}>
                              <div className="w-1/4 border-r border-dashed" style={{ background: `${b.brand_colors.primary}35`, borderColor: `${b.brand_colors.primary}70` }} />
                              <div className="flex-1" style={{ background: `${b.brand_colors.primary}15` }} />
                            </div>
                          )}
                          {opt.id === "carousel" && (
                            <div className="flex gap-1 h-full">
                              {[0,1,2].map(i => <div key={i} className="w-2/5 shrink-0 rounded" style={{ background: `${b.brand_colors.primary}30` }} />)}
                            </div>
                          )}
                          {opt.id === "billboard" && (
                            <div className="h-full rounded overflow-hidden flex flex-col">
                              <div className="h-2/3" style={{ background: `${b.brand_colors.primary}45` }} />
                              <div className="flex-1" style={{ background: `${b.brand_colors.primary}15` }} />
                            </div>
                          )}
                        </div>
                        <div className={cn("text-[10px] font-semibold mt-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.emoji} {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* CP-67: element pack — the finishing touches. */}
              <Section title="Design elements" subtitle="The finishing touches — badge chips, section titles, dividers between sections, and a glow behind buttons.">
                <div className="space-y-4">
                  {/* Badges */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Badge chips ("Just for you", "20% off", "Earn")</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {BADGE_STYLES.map(opt => {
                        const selected = (b.badge_style ?? "gradient") === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => update("badge_style", opt.id)}
                            className={cn(
                              "rounded-lg border-2 px-2 py-1.5 transition flex items-center gap-1.5",
                              selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                            )}
                          >
                            <span
                              className="inline-flex items-center text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full shadow-sm"
                              style={badgeCss(opt.id, b.brand_colors.primary, b.brand_colors.secondary)}
                            >
                              20% off
                            </span>
                            <span className={cn("text-[10px] font-semibold", selected ? "text-brand-primary" : "text-zinc-600")}>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Headings */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Section titles</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {HEADING_STYLES.map(opt => {
                        const selected = (b.heading_style ?? "plain") === opt.id;
                        const grad = `linear-gradient(135deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})`;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => update("heading_style", opt.id)}
                            className={cn(
                              "rounded-lg border-2 px-2.5 py-1.5 transition flex items-center gap-1.5",
                              selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                            )}
                          >
                            {opt.id === "sticker" ? (
                              <span className="text-[10px] font-extrabold text-white px-1.5 py-0.5 rounded" style={{ background: grad }}>Rewards</span>
                            ) : opt.id === "bar" ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-800"><span className="inline-block h-3 w-1 rounded-full" style={{ background: grad }} />Rewards</span>
                            ) : opt.id === "underline" ? (
                              <span className="text-[10px] font-bold text-zinc-800 inline-block">Rewards<span className="block h-[2px] w-5 rounded-full mt-0.5" style={{ background: grad }} /></span>
                            ) : (
                              <span className="text-[10px] font-bold text-zinc-800">Rewards</span>
                            )}
                            <span className={cn("text-[10px] font-semibold", selected ? "text-brand-primary" : "text-zinc-600")}>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Dividers */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Section dividers</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {DIVIDER_STYLES.map(opt => {
                        const selected = (b.divider_style ?? "none") === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => update("divider_style", opt.id)}
                            className={cn(
                              "rounded-lg border-2 px-3 py-1.5 text-[10px] font-semibold transition",
                              selected ? "border-brand-primary ring-2 ring-brand-primary/20 text-brand-primary" : "border-zinc-200 hover:border-zinc-300 text-zinc-600",
                            )}
                          >
                            {opt.emoji} {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* CTA glow */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Button glow (primary CTAs)</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {CTA_GLOWS.map(opt => {
                        const selected = (b.cta_glow ?? "none") === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => update("cta_glow", opt.id)}
                            className={cn(
                              "rounded-lg border-2 px-2 py-1.5 transition flex items-center gap-1.5",
                              selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                            )}
                          >
                            <span
                              className="text-[10px] font-extrabold text-white px-2.5 py-1 rounded-full"
                              style={{
                                background: `linear-gradient(135deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})`,
                                boxShadow:
                                  opt.id === "soft"
                                    ? `0 6px 18px -6px ${b.brand_colors.primary}99`
                                    : opt.id === "bold"
                                      ? `0 8px 24px -4px ${b.brand_colors.primary}cc, 0 0 0 1px ${b.brand_colors.primary}33`
                                      : "none",
                              }}
                            >
                              Claim
                            </span>
                            <span className={cn("text-[10px] font-semibold", selected ? "text-brand-primary" : "text-zinc-600")}>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Section>

              {/* CP-72: the game picker is gone — every business plays the
                  Prize Wheel (slot/boxes removed). Wheel prizes + odds are
                  configured on the Rewards tab. Only the demo toggle stays. */}
              <Section title="Demo mode" subtitle="For pitching: the Prize Wheel becomes replayable — no check-in or cooldown required.">
                <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="cursor-pointer text-sm font-semibold">Demo app (for pitching)</Label>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                      Turn OFF when this app goes live for real customers.
                    </p>
                  </div>
                  <Switch
                    checked={!!b.is_demo}
                    onCheckedChange={(v) => update("is_demo", v)}
                  />
                </div>
              </Section>

              {/* CP-65: streak theme — the streak chip, Home teaser card, and
                  full streak panel all wear this. No more locked-in orange. */}
              <Section title="Streak theme" subtitle="The color story of the streak chip, teaser card, and streak panel. Match it to the brand or pick a vibe.">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                  {STREAK_THEMES.map(t => {
                    const selected = (b.streak_theme ?? "fire") === t.id;
                    const resolved = resolveStreakTheme(t.id, b.brand_colors.primary);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => update("streak_theme", t.id)}
                        className={cn(
                          "rounded-xl border-2 overflow-hidden text-left transition",
                          selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                        title={t.label}
                      >
                        <div
                          className="h-9 flex items-center justify-center text-white text-sm"
                          style={{ background: streakGradient(resolved) }}
                        >
                          {t.emoji}
                        </div>
                        <div className={cn("text-[10px] font-semibold px-1.5 py-1 truncate", selected ? "text-brand-primary" : "text-zinc-600")}>
                          {t.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* CP-99 SIMPLIFIED: one page-theme picker (visual thumbnails,
                    minimal → wild) + one progress-color choice. The old
                    env-color / pattern / etc. controls are gone — legacy
                    values still render for apps that set them. */}
                <div className="space-y-2 mt-4">
                  <Label className="text-xs text-muted-foreground">Streak page theme</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {STREAK_PAGE_THEMES.map(t => {
                      const selected = (b.streak_page_theme ?? null) === t.id;
                      const env = t.brandTint
                        ? resolveStreakPage({ ...b, streak_page_theme: t.id }).env
                        : t.env;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => update("streak_page_theme", t.id)}
                          className={cn(
                            "rounded-xl border-2 overflow-hidden text-left transition",
                            selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                          )}
                          title={`${t.category} · ${t.label}`}
                        >
                          {/* mini preview: environment + pattern + a tiny road */}
                          <div className="relative h-12 overflow-hidden"
                            style={{ background: `linear-gradient(160deg, ${env.top}, ${env.mid} 55%, ${env.edge})`, ...(t.pattern ?? {}) }}>
                            {t.useAppBackground && (
                              <div className="absolute inset-0" style={{
                                background: b.surface_color ?? "#fafafa",
                              }} />
                            )}
                            {/* decor hints */}
                            {(t.decor ?? []).slice(0, 4).map((d, di) => (
                              <span key={di} className="absolute rounded-full"
                                style={{
                                  top: `${15 + di * 20}%`, left: di % 2 === 0 ? "12%" : "78%",
                                  width: 5, height: d.kind === "confetti" ? 8 : 5,
                                  background: "color" in d ? d.color : "#fff",
                                  opacity: Math.min(0.8, d.o + 0.2),
                                  filter: d.kind === "circle" && d.blur ? "blur(1.5px)" : undefined,
                                }} />
                            ))}
                            <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-1.5 rounded-full bg-white/85" />
                          </div>
                          <div className="px-1.5 py-1">
                            <div className={cn("text-[10px] font-semibold truncate", selected ? "text-brand-primary" : "text-zinc-700")}>
                              {t.label}
                            </div>
                            <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-400">{t.category}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    From clean big-brand minimal to full confetti mode. Whatever you pick, the road, rewards, and text stay protected and readable — patterns never cross the center lane.
                  </p>
                </div>

                {/* Progress colors: default fire / brand / custom. */}
                <div className="space-y-2 mt-4">
                  <Label className="text-xs text-muted-foreground">Progress colors</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "default", label: "Classic fire", theme: resolveStreakTheme(b.streak_theme, b.brand_colors.primary), active: !b.streak_progress_mode },
                      { key: "brand", label: "Match brand", theme: resolveStreakTheme("brand", b.brand_colors.primary), active: b.streak_progress_mode === "brand" },
                      { key: "custom", label: "Custom", theme: resolveStreakTheme("brand", /^#[0-9a-fA-F]{6}$/.test(b.streak_progress_mode ?? "") ? b.streak_progress_mode! : b.brand_colors.primary), active: /^#/.test(b.streak_progress_mode ?? "") },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => update("streak_progress_mode",
                          opt.key === "default" ? null : opt.key === "brand" ? "brand" : (/^#/.test(b.streak_progress_mode ?? "") ? b.streak_progress_mode : b.brand_colors.primary))}
                        className={cn(
                          "rounded-xl border-2 overflow-hidden text-left transition",
                          opt.active ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-zinc-200 hover:border-zinc-300",
                        )}
                      >
                        <div className="h-7 mx-2 mt-2 rounded-full"
                          style={{ background: `linear-gradient(90deg, ${opt.theme.cell[2]}, ${opt.theme.cell[1]}, ${opt.theme.cell[0]})` }} />
                        <div className={cn("text-[10px] font-semibold px-2 py-1.5", opt.active ? "text-brand-primary" : "text-zinc-600")}>
                          {opt.label}
                        </div>
                      </button>
                    ))}
                  </div>
                  {/^#/.test(b.streak_progress_mode ?? "") && (
                    <div className="flex gap-2 items-center">
                      <input type="color" value={b.streak_progress_mode ?? "#f97316"}
                        onChange={e => update("streak_progress_mode", e.target.value)}
                        className="h-10 w-12 rounded border cursor-pointer" />
                      <Input value={b.streak_progress_mode ?? ""}
                        onChange={e => update("streak_progress_mode", e.target.value || null)} />
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Colors the burning progress on the reward road. Brand and custom build a dark-to-bright range (never a flat line), and unreadable picks are auto-corrected.
                  </p>
                </div>
              </Section>

              <Section title="Location & map" subtitle="Show a map + “Call now” button at the bottom of the customer home.">
                <div className="flex items-center justify-between rounded-xl border p-3 mb-3">
                  <div>
                    <div className="text-sm font-semibold">Show location card</div>
                    <div className="text-xs text-muted-foreground">Map, address, and a Call-now button on Home.</div>
                  </div>
                  <Switch
                    checked={!!b.widget_config.location}
                    onCheckedChange={(v) => update("widget_config", { ...b.widget_config, location: v })}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Phone number">
                    <Input
                      value={b.contact_info?.phone ?? ""}
                      onChange={e => update("contact_info", { ...(b.contact_info ?? {}), phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </Field>
                  <Field label="Google Maps link">
                    <Input
                      value={b.contact_info?.map_url ?? ""}
                      onChange={e => update("contact_info", { ...(b.contact_info ?? {}), map_url: e.target.value })}
                      placeholder="https://maps.app.goo.gl/…"
                    />
                  </Field>
                </div>
                <Field label="Address (shown + used to draw the map)">
                  <Input
                    value={b.contact_info?.address ?? ""}
                    onChange={e => update("contact_info", { ...(b.contact_info ?? {}), address: e.target.value })}
                    placeholder="123 Main St, City, ST 00000"
                  />
                </Field>
                <Field label="Hours (optional)">
                  <Input
                    value={b.contact_info?.hours ?? ""}
                    onChange={e => update("contact_info", { ...(b.contact_info ?? {}), hours: e.target.value })}
                    placeholder="Opens at 9:00 AM"
                  />
                </Field>
                {/* CP-99 3c.1: the band behind the map card was fixed white —
                    now adjustable per business. Blank = white (original look). */}
                <div className="space-y-2 mt-4">
                  <Label className="text-xs text-muted-foreground">Section background color</Label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={b.location_card_color ?? "#ffffff"}
                      onChange={e => update("location_card_color", e.target.value)}
                      className="h-10 w-12 rounded border cursor-pointer" />
                    <Input value={b.location_card_color ?? ""} placeholder="#ffffff (default)"
                      onChange={e => update("location_card_color", e.target.value || null)} />
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => update("location_card_color", null)}>
                      Reset
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    The full-width band behind the map + Call-now card at the bottom of Home. The map card itself stays white so the address is always readable.
                  </p>
                </div>
              </Section>

              <Section title="Customer-app features" subtitle="Turn features on or off — the customer app re-shapes its tabs and Home layout to match.">
                <WidgetToggleGroups
                  config={b.widget_config}
                  onChange={(next) => update("widget_config", next)}
                />
              </Section>

              {/* CP-42: TemplateApplyPanel removed. The industry template
                  is chosen ONCE during the new-business creation flow
                  (NewBusinessModal). A post-creation reset surface added
                  no value and risked clobbering the agency's tuning. */}
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

                {/* CP-87: referral qualification — the friend must spend
                    this much before EITHER side gets referral points.
                    $0 = instant payout on signup (the old behavior). */}
                <div className="mt-6 rounded-xl border bg-zinc-50 p-4">
                  <Label className="text-sm font-semibold">Referral qualification</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                    Stops link-farming: the referred friend must spend this much
                    (front-desk purchases) before both sides get their referral
                    points. Both apps show a live progress bar. Set $0 for
                    instant payout on signup.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative max-w-[160px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number" min="0" step="1" className="pl-7"
                        value={(((b.point_rules.referral_min_spend_cents ?? 2000) / 100)).toString()}
                        onChange={e => {
                          const dollars = Math.max(0, parseFloat(e.target.value || "0") || 0);
                          update("point_rules", {
                            ...b.point_rules,
                            referral_min_spend_cents: Math.round(dollars * 100),
                          });
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      minimum friend spend before payout
                    </span>
                  </div>
                </div>
              </Section>

              <RewardsManager business={b} />
              {/* CP-72: Prize Wheel prizes + odds live HERE on the Rewards
                  tab (Andrew's call — not Brand/Widgets). The wheel wedges
                  customers see mirror this pool. */}
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
          {tab === "membership" && (
            <div className="space-y-6">
              <MembershipEditor business={b} onUpdate={patch} />
              {/* CP-87: payment modes + plans & passes (CP-86) — the exact
                  setup the manager sees on their Membership tab, so admins
                  can configure passes from the app builder too. */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Payments, plans & passes</h3>
                <MembershipBillingSetup business={b} />
              </div>
            </div>
          )}
          {tab === "news"       && <NewsManager business={b} />}
          {tab === "settings"   && (
            <div className="space-y-6">
              <BusinessSettingsPanel business={b} onUpdate={patch} />
              {/* CP-87: same announcements surface the manager desk has —
                  post/clear the customer-facing banner from the builder. */}
              <AnnouncementComposer businessId={b.id} primary={b.brand_colors.primary} />
              {/* CP-36b: per-business notification toggles + manual
                  broadcast composer (moved here from the manager view). */}
              <NotificationSettingsPanel business={b} />
              {/* CP-37.12: WebhookSettings + AutomationRulesEditor
                  removed from settings — kept in repo for future. */}
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
              <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                {previewMode === "live" ? "Live preview" : "Mockup preview"}
              </div>
              {/* CP-45: Live = the real customer app in a frame (always in
                  sync, every tab works). Mockup = instant unsaved edits. */}
              <div className="mt-2 inline-flex rounded-full bg-zinc-100 p-0.5 gap-0.5">
                {(["live", "mock"] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPreviewMode(m)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                      previewMode === m
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "live" ? "Live app" : "Mockup"}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">
                {previewMode === "live"
                  ? "The real customer app — refreshes when you hit Save."
                  : "Instant preview of unsaved colors & toggles."}
              </div>
            </div>
            <PhoneFrame>
              {previewMode === "live" ? (
                <iframe
                  key={liveReloadKey}
                  src={`/${b.slug}/app`}
                  title="Live customer app preview"
                  className="h-full w-full border-0 bg-white"
                />
              ) : (
                <CustomerPreview
                  business={b}
                  activeTab={previewTab}
                  onTabChange={setPreviewTab}
                  rewards={previewRewards}
                  offer={previewOffer}
                  news={previewNews}
                  membershipImageUrl={b.membership_image_url}
                />
              )}
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
