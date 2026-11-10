import type { Metadata } from "next";
import QRCode from "react-qr-code";
import { getPreviewRow, getPreviewState, pitchFor, PREVIEW_SLUG_RE } from "@/lib/preview";
import { AutoRefresh, PreviewActions } from "@/components/preview-actions";
import { CtaBar, PreviewStage } from "@/components/preview-stage";
import { PreviewGate } from "@/components/preview-gate";
import { OFFER } from "@/lib/offer";

/**
 * /p/<slug> — CP-232 · the instant app preview a med spa owner lands on after the ad.
 *
 * Their real app (/<slug>, the same screens patients use) runs inside a phone
 * frame. Lead-magnet audit, step 2 (this page is the whole funnel): a "Preview mode,
 * engine off" banner on top; two equal buttons always on screen on a phone
 * ([Book 15 min, turn it on live] [Just look around]); a one-tap logo/color fix;
 * a tappable test push. "Text me my app" and the QR code sit further down.
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

export default async function PreviewPage({ params }: { params: { slug: string } }) {
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
  // Audit step 5: scarcity ("first 10", "one per area") only when we know the area is open.
  const open = row.area_open === true;

  return (
    <Shell>
      {/* Visible, not buried: what they're looking at is the app with the engine switched off. */}
      <div className="sticky top-0 z-40 border-y border-amber-200 bg-amber-50/95 backdrop-blur" role="status">
        <p className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-2 text-[13.5px] font-semibold text-amber-900">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          Preview mode — engine off.
          <span className="font-normal text-amber-900/80">Reminders, offers and points don&apos;t send yet.</span>
        </p>
      </div>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-32 pt-4 lg:grid-cols-[418px_1fr] lg:items-start lg:gap-16 lg:pb-20 lg:pt-6">
        {/* The real app, in a phone frame, with the logo fix and the test push */}
        <div>
          <PreviewStage slug={slug} businessName={row.business_name} logoUrl={logoUrl} primary={primary} apiOrigin={SITE} />
          <PreviewGate slug={slug} businessName={row.business_name} primary={primary} apiOrigin={SITE} />
          <p className="mt-3 text-center text-[13px] text-sub">Tap around. This is the app your patients would use.</p>
        </div>

        {/* The pitch */}
        <section className="lg:pt-8">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">
            {row.business_name}, this is your app.
          </h1>
          <CtaBar walkthroughUrl={`${SITE}/medspa/walkthrough/${slug}?src=page`} primary={primary} taken={taken} />
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

          {/* CP-237: the offer, stated plainly (numbers in lib/offer.ts, mirrored from the venue site).
              Step 5: not shown at all on a taken area (the bar's button is the waitlist there). */}
          {!taken && <section aria-labelledby="pv-offer" className="mt-8 max-w-[34rem] rounded-[24px] bg-white p-5 shadow-soft sm:p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: primary }}>{OFFER.foundingActive && open ? `Want it live? First ${OFFER.spots} med spas` : "Want it live?"}</p>
            <h2 id="pv-offer" className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.015em]">{OFFER.foundingActive ? `The ${OFFER.name}` : "Your setup"}</h2>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              {OFFER.foundingActive && <span className="pb-1 text-[16px] font-semibold text-sub line-through">${OFFER.setupFull.toLocaleString("en-US")}</span>}
              <span className="text-[38px] font-bold leading-none tracking-tight">${(OFFER.foundingActive ? OFFER.setupFounding : OFFER.setupFull).toLocaleString("en-US")}</span>
              <span className="pb-1 text-[14px] text-sub">one-time setup</span>
            </div>
            <p className="mt-2 text-[13.5px] leading-snug text-sub">
              {OFFER.monthlyPrice ? `Then $${OFFER.monthlyPrice} a month, month to month.` : "Then one flat monthly plan, month to month, quoted on your walkthrough."} No percentage of your treatment revenue.
              {OFFER.foundingActive ? ` Founding price in exchange for ${OFFER.trade}.` : ""}
            </p>
            <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {OFFER.includes.map((t) => <li key={t} className="flex items-start gap-2 text-[14px] text-ink"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: primary }} aria-hidden />{t}</li>)}
            </ul>
            <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px] text-sub">
              {OFFER.guarantees.map((g) => <li key={g}>{g}.</li>)}
            </ul>
            {open && <p className="mt-3 text-[13.5px] font-semibold">One med spa per {OFFER.radiusMiles}-mile area.</p>}
          </section>}

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
    </Shell>
  );
}
