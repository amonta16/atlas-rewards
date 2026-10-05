/**
 * MedspaHome — CP-193 · /<slug>/app for med spas (Dermis Home)
 *
 * Logo bar → photo hero with the greeting → points pill (with "N rewards
 * unlocked") → birthday gift (birthday week only) → what's due → membership
 * invite → rewards rail → shop picks → the team.
 */
import type { Business, Membership } from "@/lib/types/database";
import { getCachedUser } from "@/lib/supabase/server";
import { optimizedUrl } from "@/lib/img";
import { AppLink } from "@/components/customer/app-link";
import { bookingEnabled } from "@/lib/booking";
import { getMedspaPatientContext, type MedspaPatientContext } from "@/lib/data/medspa";
import { cents, shopPrice, type MedspaProvider, type MedspaShopItem } from "@/lib/medspa";
import { money } from "@/lib/membership";
import { firstNameOf, getMsBirthdayGift, getMsMembership, getMsOpenOrderCount, getMsProfile, getMsRewards, type MsMembership, type MsReward } from "@/lib/medspa-app/data";
import { MsTopBar } from "./chrome";
import { RewardTile } from "./reward-card";
import { BirthdayGift } from "./birthday-gift";
import { IcCalendar, IcChevronRight, IcGift, IcSparkle } from "./icons";

export async function MedspaHome({ business, membership }: { business: Business; membership: Membership | null }) {
  const user = await getCachedUser();
  const uid = user?.id ?? "";
  const [profile, rewards, bag, ms, gift, ctx] = await Promise.all([
    getMsProfile(uid), getMsRewards(business.id), getMsOpenOrderCount(business.id, uid),
    getMsMembership(business.id, membership?.id ?? null), getMsBirthdayGift(membership?.id ?? null),
    getMedspaPatientContext(business, uid || null),
  ]);
  return (
    <MedspaHomeView
      business={business}
      firstName={firstNameOf(profile, user?.email)}
      fullName={profile?.full_name ?? firstNameOf(profile, user?.email)}
      points={membership?.points_balance ?? 0}
      rewards={rewards}
      bag={bag}
      ms={ms}
      gift={gift}
      next={ctx.due[0] ?? null}
      shopPicks={ctx.cfg.shop.enabled ? ctx.cfg.shop.items.filter((i) => i.is_active && i.featured).slice(0, 6) : []}
      team={ctx.cfg.providers.filter((p) => p.is_active)}
    />
  );
}

/** Presentational Home. Props only, so it renders the same in the builder preview or a test harness. */
export function MedspaHomeView({ business, firstName: first, fullName, points, rewards, bag, ms, gift, next, shopPicks, team }: {
  business: Business; firstName: string; fullName: string; points: number; rewards: MsReward[]; bag: number; ms: MsMembership;
  gift: number | null; next: MedspaPatientContext["due"][number] | null; shopPicks: MedspaShopItem[]; team: MedspaProvider[];
}) {
  const slug = business.slug;
  const unlocked = rewards.filter((r) => r.point_cost <= points).length;
  const pointsLabel = `${business.name} points`;
  const { primary, secondary } = business.brand_colors;

  return (
    <div className="bg-[var(--ms-bg)]">
      <MsTopBar slug={slug} logoUrl={business.logo_url} logoAlt={business.name} title={business.name} bagCount={bag} />

      {/* Hero */}
      <div className="relative h-[300px] overflow-hidden" style={{ background: `linear-gradient(150deg, ${secondary}, ${primary})` }}>
        {business.hero_image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={optimizedUrl(business.hero_image_url, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.42)_0%,rgba(0,0,0,.08)_45%,rgba(0,0,0,0)_70%)]" />
        <div className="relative px-5 pt-6 text-white">
          <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.015em] drop-shadow-sm">Welcome back, {first}!</h1>
          <p className="mt-0.5 text-[20px] text-white/75">{business.name}</p>
        </div>
      </div>

      {/* Points pill */}
      <div className="relative z-10 -mt-[72px] px-5">
        {unlocked > 0 && (
          <AppLink slug={slug} to="/rewards" className="absolute -top-12 right-6 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[14px] leading-tight shadow-[0_10px_24px_-12px_rgba(23,28,45,.45)] after:absolute after:left-1/2 after:top-full after:border-[7px] after:border-transparent after:border-t-white" style={{ color: "var(--ms-ink)" }}>
            <IcGift className="h-6 w-6" style={{ color: "var(--ms-p)" }} />
            <span>{unlocked} reward{unlocked === 1 ? "" : "s"}<br />unlocked</span>
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: "var(--ms-p)" }} />
          </AppLink>
        )}
        <AppLink slug={slug} to="/rewards" className="flex items-center gap-3 rounded-2xl bg-white/95 px-5 py-4 shadow-[0_14px_34px_-18px_rgba(23,28,45,.45)] ring-1 ring-black/[.04] backdrop-blur-xl active:scale-[.99] transition">
          <span className="text-[27px] font-medium tabular-nums leading-none" style={{ color: "var(--ms-p)" }}>{points.toLocaleString()}</span>
          <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--ms-sub)" }}>{pointsLabel}</span>
          <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-p)" }} />
        </AppLink>
      </div>

      {gift && <BirthdayGift firstName={first} fullName={fullName} points={gift} pointsLabel={pointsLabel} />}

      {/* What's due */}
      {(next || bookingEnabled(business)) && (
        <section className="px-5 pt-8">
          <AppLink slug={slug} to={next ? "/care" : "/book"} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-[var(--ms-line)] active:scale-[.99] transition">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}><IcCalendar className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-semibold" style={{ color: "var(--ms-ink)" }}>{next ? next.row.treatment_name : "Book your next visit"}</span>
              <span className="block text-[14px]" style={{ color: next && (next.state.tone === "due" || next.state.tone === "overdue") ? "var(--ms-p)" : "var(--ms-sub)" }}>
                {next ? next.state.label : "Pick a time that suits you"}
              </span>
            </span>
            <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-icon)" }} />
          </AppLink>
        </section>
      )}

      {/* Membership invite */}
      {!ms.isPaid && ms.view.enabled && ms.view.purchasable && (
        <section className="px-5 pt-5">
          <AppLink slug={slug} to="/store?tab=membership" className="relative block overflow-hidden rounded-[20px] active:scale-[.99] transition" style={{ background: `linear-gradient(140deg, ${secondary}, ${primary})` }}>
            {ms.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={optimizedUrl(ms.imageUrl, 800)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,22,34,.72),rgba(20,22,34,.15))]" />
            <div className="relative p-5 text-white">
              <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/80">Try {ms.view.name}</div>
              <div className="mt-1 max-w-[16ch] text-[22px] font-semibold leading-tight">Save on every treatment</div>
              {ms.view.fromCents != null && <div className="mt-3 text-[15px] text-white/85">From <b className="text-white">{money(ms.view.fromCents)}</b>{ms.view.monthlyOffered && ms.view.monthlyPriceCents === ms.view.fromCents ? "/mo" : ""}</div>}
            </div>
          </AppLink>
        </section>
      )}

      {/* Rewards rail */}
      {rewards.length > 0 && (
        <section className="pt-9">
          <div className="flex items-baseline justify-between px-5">
            <h2 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Rewards</h2>
            <AppLink slug={slug} to="/rewards" className="flex items-center gap-1 text-[17px]" style={{ color: "var(--ms-p)" }}>See more <IcChevronRight className="h-4 w-4" strokeWidth={2} /></AppLink>
          </div>
          <div className="ms-rail mt-4 flex gap-3 overflow-x-auto px-5 pb-1 scroll-px-5">
            {rewards.slice(0, 8).map((r) => (
              <AppLink key={r.id} slug={slug} to={r.point_cost <= points ? `/rewards?redeem=${r.id}` : "/rewards"} className="block active:scale-[.98] transition">
                <RewardTile r={r} points={points} />
              </AppLink>
            ))}
          </div>
        </section>
      )}

      {/* Shop picks */}
      {shopPicks.length > 0 && (
        <section className="pt-9">
          <div className="flex items-baseline justify-between px-5">
            <h2 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Shop</h2>
            <AppLink slug={slug} to="/store" className="flex items-center gap-1 text-[17px]" style={{ color: "var(--ms-p)" }}>See all <IcChevronRight className="h-4 w-4" strokeWidth={2} /></AppLink>
          </div>
          <div className="ms-rail mt-4 flex gap-3 overflow-x-auto px-5 pb-1 scroll-px-5">
            {shopPicks.map((it) => {
              const price = it.kind === "gift_card" ? it.amounts[0] ?? null : shopPrice(it, ms.isPaid);
              return (
                <AppLink key={it.id} slug={slug} to={`/store?item=${it.id}`} className="block w-[172px] shrink-0 overflow-hidden rounded-[18px] bg-white ring-1 ring-[var(--ms-line)] active:scale-[.98] transition">
                  <div className="relative aspect-square" style={{ background: "color-mix(in srgb, var(--ms-p) 10%, #fff)" }}>
                    {it.image_url
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={optimizedUrl(it.image_url, 360)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      : <span className="absolute inset-0 grid place-items-center" style={{ color: "var(--ms-p)" }}><IcSparkle className="h-9 w-9" /></span>}
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 text-[15px] font-semibold leading-snug" style={{ color: "var(--ms-ink)" }}>{it.name}</div>
                    <div className="mt-1 text-[15px]" style={{ color: "var(--ms-sub)" }}>{price != null ? (it.kind === "gift_card" ? `From ${cents(price)}` : cents(price)) : "Ask at the desk"}</div>
                  </div>
                </AppLink>
              );
            })}
          </div>
        </section>
      )}

      {/* Team */}
      {team.length > 0 && (
        <section className="pt-9">
          <h2 className="px-5 text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Your team</h2>
          <div className="ms-rail mt-4 flex gap-4 overflow-x-auto px-5 pb-1 scroll-px-5">
            {team.map((p) => (
              <div key={p.id} className="w-[120px] shrink-0 text-center">
                <div className="mx-auto h-[96px] w-[96px] overflow-hidden rounded-full bg-[var(--ms-chip)] ring-4 ring-white">
                  {p.photo_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={optimizedUrl(p.photo_url, 240)} alt="" className="h-full w-full object-cover" />
                    : <span className="grid h-full place-items-center text-[28px] font-semibold" style={{ color: "var(--ms-p)" }}>{p.name.slice(0, 1)}</span>}
                </div>
                <div className="mt-2 truncate text-[15px] font-semibold" style={{ color: "var(--ms-ink)" }}>{p.name}</div>
                <div className="line-clamp-2 text-[13px] leading-snug" style={{ color: "var(--ms-sub)" }}>{p.title}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="h-6" />
    </div>
  );
}
