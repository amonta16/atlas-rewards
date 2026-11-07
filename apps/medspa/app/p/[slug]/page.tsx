import type { Metadata } from "next";
import QRCode from "react-qr-code";
import { getPreviewRow, getPreviewState, PREVIEW_SLUG_RE } from "@/lib/preview";
import { AutoRefresh, PreviewActions } from "@/components/preview-actions";

/**
 * /p/<slug> — CP-232 · the instant app preview a med spa owner lands on after the ad.
 *
 * Their real app (/<slug>, the same screens patients use) runs inside a phone
 * frame; around it: a "Preview, not live yet" badge, a QR code to open it on
 * their phone, "Text me my app" and "Go live". noindex/nofollow. Expired,
 * missing, still-building and lookup-failure states each get a friendly page.
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

  return (
    <Shell>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-32 pt-2 lg:grid-cols-[400px_1fr] lg:items-start lg:gap-16 lg:pb-20 lg:pt-6">
        {/* The real app, in a phone frame */}
        <div className="mx-auto w-full max-w-[400px]">
          <div className="relative rounded-[54px] bg-[#111] p-3 shadow-[0_40px_80px_-30px_rgba(23,27,38,.55)]">
            <div aria-hidden className="absolute left-1/2 top-3 z-10 h-7 w-32 -translate-x-1/2 rounded-b-2xl bg-[#111]" />
            <iframe
              src={`/${slug}`}
              title={`${row.business_name} app preview`}
              className="block h-[min(760px,78dvh)] w-full rounded-[42px] bg-white"
              loading="eager"
            />
          </div>
          <p className="mt-3 text-center text-[13px] text-sub">Tap around. This is the app your patients would use.</p>
        </div>

        {/* The pitch */}
        <section className="lg:pt-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[12.5px] font-semibold text-amber-900">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden /> Preview · not live yet
          </span>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">
            {row.business_name}, this is your app.
          </h1>
          <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-sub">
            Your name, your colors and your treatments, with memberships, rewards and reminders that bring patients back before their treatment wears off.
          </p>
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
            checkoutUrl={process.env.STRIPE_FOUNDING_CHECKOUT_URL ?? null}
            apiOrigin={SITE}
            areaOpen={row.area_open}
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
