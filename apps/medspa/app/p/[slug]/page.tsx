import type { Metadata } from "next";
import QRCode from "react-qr-code";
import { getPreviewRow, getPreviewState, pitchFor, PREVIEW_SLUG_RE } from "@/lib/preview";
import { AutoRefresh, PreviewActions } from "@/components/preview-actions";
import { CtaBar, PreviewStage } from "@/components/preview-stage";
import { PreviewGate } from "@/components/preview-gate";
import { BonusDetails, BonusTiles, PreviewTopBar, type OwnerMode } from "@/components/launch-bonus";

/**
 * /p/<slug> — CP-232 · the instant app preview a med spa owner lands on after the ad.
 *
 * Their real app (/<slug>, the same screens patients use) runs inside a phone
 * frame. Lead-magnet audit, step 2 (this page is the whole funnel): a "Preview mode,
 * engine off" banner on top; two equal buttons always on screen on a phone
 * ([Book 15 min, turn it on live] [Just look around]); a one-tap logo/color fix;
 * a tappable test push. "Text me my app" and the QR code sit further down.
 * CP-245: a 4-hour launch bonus (book the walkthrough in time, get 3 bonuses): a countdown bar on
 * top and the bonus stack under the pitch, gone when the window ends; not on a taken area.
 * Step 3: the lead is asked for here, after the app is on screen (PreviewGate: email + zip,
 * on scroll-past or 45 s). Nothing is asked before this page.
 * noindex/nofollow. Expired, missing, still-building and lookup-failure states
 * each get a friendly page.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your app preview",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

const SITE = (process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app").replace(/\/$/, "");
const SELF = (process.env.NEXT_PUBLIC_MEDSPA_ORIGIN ?? "https://med.atlas-engine.app").replace(/\/$/, "");

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#F5F6F5]">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-5">
        <a href={`${SITE}/medspa`} className="text-[15px] font-bold tracking-[0.18em] text-ink">ATLAS ENGINE</a>
      </header>
      {children}
    </div>
  );
}

function Notice({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <Shell>
      <main className="mx-auto grid max-w-md place-items-center px-6 pb-24 pt-16 text-center">
        <div className="w-full rounded-[28px] bg-white p-8 shadow-card">
          <h1 className="text-[24px] font-semibold tracking-[-0.015em]">{title}</h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-sub">{body}</p>
          {cta && <a href={cta.href} className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-semibold text-white">{cta.label}</a>}
        </div>
      </main>
    </Shell>
  );
}

export default async function PreviewPage({ params, searchParams }: { params: { slug: string }; searchParams?: Record<string, string | string[] | undefined> }) {
  const slug = (params.slug ?? "").toLowerCase();
  if (!PREVIEW_SLUG_RE.test(slug)) return <Notice title="We couldn't find that preview" body="Check the link, or build a new preview in about a minute." cta={{ href: `${SITE}/medspa/app`, label: "Build my app preview" }} />;

  let state: Awaited<ReturnType<typeof getPreviewState>>;
  try { state = await getPreviewState(slug); } catch {
    return <Notice title="We couldn't load your preview" body="Something went wrong on our side. Please refresh in a moment." cta={{ href: `/p/${slug}`, label: "Try again" }} />;
  }
  if (state === "missing") return <Notice title="We couldn't find that preview" body="Check the link, or build a new preview in about a minute." cta={{ href: `${SITE}/medspa/app`, label: "Build my app preview" }} />;
  if (state === "expired") return <Notice title="This preview has expired" body="Previews last 14 days. Build a fresh one in about a minute, or text us and we'll set up your live app." cta={{ href: `${SITE}/medspa/app`, label: "Build a new preview" }} />;
  if (state === "building" || state === "failed") {
    return (
      <>
        <AutoRefresh />
        <Notice title="Your app is almost ready" body="We're still putting it together. This page refreshes on its own." />
      </>
    );
  }

  const row = await getPreviewRow(slug).catch(() => null);
  if (!row) return <Notice title="We couldn't load your preview" body="Something went wrong on our side. Please refresh in a moment." cta={{ href: `/p/${slug}`, label: "Try again" }} />;

  const primary = /^#[0-9a-f]{6}$/i.test(row.colors?.primary ?? "") ? row.colors!.primary! : "#4A3F38";
  const pageUrl = `${SELF}/p/${slug}`;
  const expires = new Date(row.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const pitch = pitchFor(row.priorities);

  const logoUrl = !row.logo_is_monogram && row.logo_url ? row.logo_url : null;
  const taken = row.area_open === false;

  const brand = { primary, logoUrl, businessName: row.business_name, appUrl: `${SELF}/${slug}` };
  const [reviews, ownerKey] = await Promise.all([getReviewImages(), ownerViewKey(slug, searchParams?.owner)]);
  const b = searchParams?.bonus;
  const owner: OwnerMode = ownerKey ? (b === "ended" || b === "claimed" ? b : "live") : null;

  return (
    <Shell>
      {/* CP-245: "3 launch bonuses end in 03:59:12" while the 4-hour window runs (nothing after). */}
      <PreviewTopBar apiOrigin={SITE} slug={slug} enabled={!taken} owner={owner} />
      {ownerKey && <OwnerBar slug={slug} k={ownerKey} mode={owner} taken={taken} />}
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-32 pt-4 lg:grid-cols-[418px_1fr] lg:items-start lg:gap-16 lg:pb-20 lg:pt-6">
        {/* The real app, in a phone frame, with the logo fix; the bonus tiles right under it */}
        <div>
          <PreviewStage slug={slug} businessName={row.business_name} logoUrl={logoUrl} primary={primary} apiOrigin={SITE} owner={!!ownerKey} />
          {!ownerKey && <PreviewGate slug={slug} businessName={row.business_name} primary={primary} apiOrigin={SITE} />}
          <BonusTiles apiOrigin={SITE} slug={slug} enabled={!taken} brand={brand} owner={owner} />
        </div>

        {/* The pitch */}
        <section className="lg:pt-8">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">
            {row.business_name}, this is your app.
          </h1>
          <CtaBar walkthroughUrl={`${SITE}/medspa/walkthrough/${slug}?src=page`} primary={primary} taken={taken} bonus={{ apiOrigin: SITE, slug, owner }} />
          <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-sub">
            Your name, your colors and your treatments. {pitch.line}
          </p>
          <ul className="mt-5 max-w-[34rem] space-y-2.5">
            {pitch.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[15.5px] text-ink">
                <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: primary }} aria-hidden>
                  <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                {b}
              </li>
            ))}
          </ul>

          {row.treatments_are_examples && (
            <p className="mt-4 max-w-[34rem] rounded-2xl bg-white p-4 text-[14.5px] text-sub shadow-soft">
              We couldn&apos;t read a treatment menu on your website, so these are example treatments. Your real menu goes in when you go live.
            </p>
          )}

          <PreviewActions
            slug={slug}
            businessName={row.business_name}
            primary={primary}
            smsNumber={process.env.PREVIEW_SMS_NUMBER ?? process.env.GHL_SMS_NUMBER ?? null}
            apiOrigin={SITE}
          />

          <div className="mt-10 hidden items-center gap-5 rounded-[24px] bg-white p-5 shadow-soft sm:flex">
            <div className="rounded-xl bg-white p-2 ring-1 ring-line">
              <QRCode value={pageUrl} size={112} level="M" />
            </div>
            <div>
              <div className="text-[16px] font-semibold">Open it on your phone</div>
              <p className="mt-1 text-[14px] text-sub">Point your camera at the code. Your preview is saved until {expires}.</p>
            </div>
          </div>
        </section>
      </main>

      {/* The bottom of the page: the bonuses in full, then real reviews */}
      <div className="mx-auto max-w-6xl px-5 pb-36 lg:pb-20">
        <BonusDetails apiOrigin={SITE} slug={slug} walkthroughUrl={`${SITE}/medspa/walkthrough/${slug}?src=bonus`} enabled={!taken} brand={brand} owner={owner} />
        <Reviews images={reviews} />
      </div>
    </Shell>
  );
}

/** CP-245: the real review screenshots from Admin → Reviews (placement "med spa pages"), at the very bottom. */
type ReviewImage = { id: string; url: string; width: number | null; height: number | null; alt: string };
async function getReviewImages(): Promise<ReviewImage[]> {
  try {
    const r = await fetch(`${SITE}/api/site-reviews?on=medspa`, { next: { revalidate: 300 } });
    if (!r.ok) return [];
    const j = (await r.json()) as { images?: ReviewImage[] };
    return (j.images ?? []).filter((i) => /^https:\/\//.test(i.url)).slice(0, 24);
  } catch { return []; }
}

function Reviews({ images }: { images: ReviewImage[] }) {
  if (!images.length) return null;
  return (
    <section aria-labelledby="pv-reviews" className="mt-12">
      <h2 id="pv-reviews" className="text-center text-[22px] font-semibold tracking-[-0.015em]">Real reviews</h2>
      <ul className="no-scrollbar -mx-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:flex-wrap lg:justify-center lg:overflow-visible lg:px-0">
        {images.map((img) => (
          <li key={img.id} className="shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.alt || "A review"} loading="lazy" decoding="async"
              width={img.width ?? undefined} height={img.height ?? undefined}
              className="h-[300px] w-auto max-w-[82vw] rounded-[18px] bg-white object-contain shadow-soft ring-1 ring-line lg:h-[340px]" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * CP-245.4 · the owner view: Admin's "Owner view" link adds ?owner=<key>. The venue site checks the
 * key (an HMAC of the slug only it can make); a wrong or missing key is just the normal page.
 */
async function ownerViewKey(slug: string, k: string | string[] | undefined): Promise<string | null> {
  if (typeof k !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(k)) return null;
  try {
    const r = await fetch(`${SITE}/api/preview/owner-check?slug=${encodeURIComponent(slug)}&k=${encodeURIComponent(k)}`, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
    return r.ok && j.ok === true ? k : null;
  } catch { return null; }
}

/** A thin strip only in the owner view: what this is, and the three bonus states to look at. */
function OwnerBar({ slug, k, mode, taken }: { slug: string; k: string; mode: OwnerMode; taken: boolean }) {
  const states: { id: NonNullable<OwnerMode>; label: string }[] = [{ id: "live", label: "Live" }, { id: "ended", label: "Ended" }, { id: "claimed", label: "Booked" }];
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2 text-[12.5px]">
        <span><b>Owner view.</b> {taken ? "Area taken, so no bonus here." : "Demo clock, only you see this. Nothing is recorded."}</span>
        {!taken && (
          <span className="flex gap-1">
            {states.map((s) => (
              <a key={s.id} href={`/p/${slug}?owner=${encodeURIComponent(k)}${s.id === "live" ? "" : `&bonus=${s.id}`}`}
                className={`rounded-full px-2.5 py-0.5 font-semibold ${mode === s.id ? "bg-amber-900 text-white" : "bg-white ring-1 ring-amber-200"}`}>{s.label}</a>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
