import Link from "next/link";
import { NotifyCard } from "@/components/notifications";
import { ScratchGift } from "@/components/scratch-gift";
import { getScratchGift } from "@/lib/gifts";
import "@fontsource/caveat/600.css";
import { optimizedUrl } from "@atlas/core/img";
import { activeTreatments, getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { bookingOptions, FINANCING_LIMITS, type FinancingMethod } from "@/lib/medspa";
import { fromPrice, priceLabel } from "@/lib/plans";
import { TopBar, Wordmark } from "@/components/chrome";
import { ActionButton } from "@/components/action-sheet";
import { RecentlyViewed, type CatalogItem } from "@/components/recently-viewed";
import { InstallCard } from "@/components/install-app";
import { IcCalendar, IcLock, IcNext, IcPin, IcSpark } from "@/components/icons";
import { EXAMPLE_IMG } from "@/lib/example";

export default async function Home({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const gift = patient.signedIn || (clinic.isExample && clinic.id === "example") ? await getScratchGift(clinic, patient.membershipId) : null;
  const base = `/${clinic.slug}`;
  const treatments = activeTreatments(clinic);
  const shopItems = clinic.cfg.shop.enabled ? clinic.cfg.shop.items.filter((s) => s.is_active) : [];
  const gallery = clinic.cfg.gallery.filter((g) => g.consent && g.before_url && g.after_url).slice(0, 6);
  const book = bookingOptions(clinic.cfg.booking, clinic.name, clinic.phone, null);
  const team = clinic.cfg.providers.filter((p) => p.is_active);
  const payLater = clinic.cfg.shop.enabled ? (["klarna", "affirm"] as FinancingMethod[]).filter((m) => clinic.cfg.shop.financing[m]) : [];
  const about = clinic.about || team[0]?.bio || null;

  const catalog: CatalogItem[] = [
    ...treatments.map((t) => ({ key: `t:${t.id}`, name: t.name, price: fromPrice(t), image: t.image_url, href: `${base}/shop/treatment/${t.id}` })),
    ...shopItems.filter((i) => i.kind !== "gift_card").map((i) => ({ key: `i:${i.id}`, name: i.name, price: priceLabel(i.price_cents), image: i.image_url, href: `${base}/shop/item/${i.id}` })),
  ];

  return (
    <>
      <TopBar slug={clinic.slug} wordmark={<Wordmark name={clinic.name} logoUrl={clinic.logoUrl} size={clinic.preview && clinic.logoUrl ? "md" : "sm"} />} />

      {/* Hero + points */}
      <section className="relative">
        <div className="relative h-[292px] overflow-hidden bg-ink">
          {clinic.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedUrl(clinic.heroUrl, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/5 to-black/20" />
          <div className="absolute left-5 right-5 top-5 animate-rise">
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-white">
              {patient.signedIn ? `Welcome back, ${patient.firstName ?? "there"}!` : "Welcome, Guest!"}
            </h2>
            <p className="mt-0.5 text-[15px] text-white/70">{clinic.name}</p>
          </div>
        </div>
        <Link
          href={patient.signedIn ? `${base}/rewards` : `${base}/login`}
          className="relative z-10 mx-4 -mt-7 flex h-[52px] items-center gap-2.5 rounded-[14px] bg-white pl-4 pr-3 shadow-[0_14px_30px_-16px_rgba(23,27,38,.4)]"
        >
          <span className="text-[17px] font-semibold tabular-nums">{patient.points.toLocaleString("en-US")}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-sub">{clinic.name} points</span>
          <span className={`shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${patient.isMember ? "bg-brand text-white" : "bg-[#E9EBED] text-ink"}`}>
            {patient.isMember ? (patient.planName ?? "Member") : "Not a member"}
          </span>
          <IcNext className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.4} />
        </Link>
      </section>

      {gift && <ScratchGift key={gift.savedId ?? gift.offerId} gift={gift} slug={clinic.slug} primary={clinic.primary} pointsLabel="points" fullName={patient.fullName ?? undefined} />}

      {/* AI skin scan */}
      <Link href={`${base}/skin-scan`} className="relative mx-4 mt-5 flex items-center gap-3.5 overflow-hidden rounded-[16px] bg-ink p-4 text-white transition active:scale-[0.99]">
        <span className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[12px] bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EXAMPLE_IMG.hero} alt="" className="h-full w-full object-cover object-[45%_40%]" />
          <span className="absolute inset-x-0 top-1/2 h-[2px] bg-white/90 shadow-[0_0_10px_rgb(var(--p-rgb))]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/60"><IcSpark className="h-3 w-3" />Free AI skin scan</span>
          <span className="mt-0.5 block text-[15.5px] font-semibold leading-tight">See what treatment could do for you</span>
          <span className="mt-0.5 block text-[12.5px] text-white/65">Skin score, 12 markers and an AI preview</span>
        </span>
        <IcNext className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2.2} />
      </Link>

      <InstallCard clinicName={clinic.name} slug={clinic.slug} />

      {patient.signedIn && <NotifyCard clinicId={clinic.id} clinicName={clinic.name} slug={clinic.slug} demo={clinic.isExample && clinic.id === "example"} />}

      <RecentlyViewed slug={clinic.slug} catalog={catalog} />

      {/* Pay later */}
      {payLater.length > 0 && (
        <Link href={`${base}/shop?tab=browse`} className="mx-4 mt-7 flex items-center gap-3.5 rounded-[14px] bg-[#F4F5F6] p-4">
          <span className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-bold" style={{ background: payLater[0] === "klarna" ? "#FFB3C7" : "#fff", color: "#111" }}>{FINANCING_LIMITS[payLater[0]].label}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold leading-tight">Treat today. Pay later. Earn rewards.</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-sub">Split your treatment into monthly payments.</span>
          </span>
        </Link>
      )}

      {/* Membership */}
      {clinic.plans.length > 0 && (
        <Link href={`${base}/shop?tab=memberships`} className="card-sheen mx-4 mt-4 block rounded-[14px] p-5 text-center text-white">
          <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.01em]">
            {patient.isMember ? "Your membership perks" : `Save big as a ${clinic.name} member`}
          </h3>
          <p className="mt-1.5 text-[13.5px] text-white/75">
            {patient.isMember ? "Everything included, in one place." : "Treatments every month. Member pricing. Exclusive perks."}
          </p>
          <span className="mt-3.5 inline-flex h-10 items-center rounded-[10px] bg-white px-5 text-[13.5px] font-semibold text-ink">See benefits</span>
        </Link>
      )}

      {/* Rewards */}
      {clinic.rewards.length > 0 && (
        <Rail title="Rewards" href={`${base}/rewards`}>
          {clinic.rewards.slice(0, 8).map((r) => {
            const open = patient.signedIn && patient.points >= r.point_cost;
            return (
              <Link key={r.id} href={`${base}/rewards#${r.id}`} className={`w-[150px] shrink-0 overflow-hidden rounded-[14px] text-center ${open ? "bg-white shadow-card ring-1 ring-line" : "bg-[#F1F2F3]"}`}>
                <div className="aspect-[5/4] bg-[#DFE1E3]">
                  {r.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedUrl(r.image_url, 300)} alt="" className={`h-full w-full object-cover ${open ? "" : "opacity-70 grayscale"}`} loading="lazy" />
                  )}
                </div>
                <div className="px-2 py-2.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E4E6E8] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.06em]">{!open && <IcLock className="h-3 w-3" strokeWidth={2} />}{r.point_cost.toLocaleString("en-US")} points</span>
                  <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug">{r.name}</p>
                </div>
              </Link>
            );
          })}
        </Rail>
      )}

      {/* Book */}
      <section className="mx-4 mt-7">
        <ActionButton
          label="Book your next visit"
          options={book}
          sheet={{ title: "Book your next visit", body: `Choose how you'd like to book with ${clinic.name}.` }}
          className="flex w-full items-center gap-3.5 rounded-[14px] bg-[#F4F5F6] p-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black text-white"><IcCalendar className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Book your next visit</span>
            <span className="block text-[13px] text-sub">Online, by text, or give us a call</span>
          </span>
          <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
        </ActionButton>
      </section>

      {/* Results */}
      {gallery.length > 0 && (
        <Rail title="Real results" href={`${base}/shop?tab=treatments`}>
          {gallery.map((g) => (
            <figure key={g.id} className="w-[250px] shrink-0">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] bg-line">
                {[["Before", g.before_url], ["After", g.after_url]].map(([label, url]) => (
                  <div key={label} className="relative aspect-[4/5] bg-tint">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={optimizedUrl(url, 260)} alt={`${label}: ${g.caption}`} className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{label}</span>
                  </div>
                ))}
              </div>
              <figcaption className="px-0.5 pt-2">
                <p className="truncate text-[13.5px] font-semibold">{g.title}</p>
                <p className="truncate text-[12.5px] text-sub">{g.caption}</p>
              </figcaption>
            </figure>
          ))}
        </Rail>
      )}

      {/* About */}
      {(about || clinic.googleReviewUrl) && (
        <section className="px-4 pt-8">
          {clinic.heroUrl && (
            <div className="aspect-[16/9] overflow-hidden rounded-[12px] bg-page">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={optimizedUrl(clinic.heroUrl, 800)} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          )}
          {about && <>
            <h3 className="mt-4 text-[15px] font-semibold">About us</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-sub">{about}</p>
          </>}
          {clinic.googleReviewUrl && (
            <a href={clinic.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span><span className="block text-[15px] font-semibold">Read all our reviews</span><span className="block text-[13px] text-sub">See what patients say on Google</span></span>
              <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
            </a>
          )}
        </section>
      )}

      {/* Find us */}
      {(clinic.address || clinic.phone) && (
        <section className="px-4 pb-4 pt-7">
          {clinic.address && (
            <div className="relative h-[190px] overflow-hidden rounded-t-[12px] bg-[#23262b]">
              <iframe title={`Map of ${clinic.name}`} loading="lazy" referrerPolicy="no-referrer"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(clinic.address)}&z=14&output=embed`}
                className="pointer-events-none absolute inset-0 h-full w-full border-0 [filter:grayscale(1)_invert(.9)_contrast(.9)]" />
            </div>
          )}
          <div className={`bg-[#F4F5F6] px-4 py-3.5 ${clinic.address ? "rounded-b-[12px]" : "rounded-[12px]"}`}>
            <p className="text-[15px] font-semibold">{clinic.name}</p>
            {clinic.address && <p className="mt-1 flex items-start gap-1.5 text-[13px] text-sub"><IcPin className="mt-px h-4 w-4 shrink-0" />{clinic.address}</p>}
          </div>
          {clinic.phone && <a href={`tel:${clinic.phone}`} className="btn-ink mt-3">Call now</a>}
        </section>
      )}
    </>
  );
}

function Rail({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between px-5">
        <h3 className="text-[19px] font-semibold tracking-[-0.015em]">{title}</h3>
        <Link href={href} className="flex items-center gap-0.5 text-[13px] font-medium text-ink">See more <IcNext className="h-3.5 w-3.5" strokeWidth={2.2} /></Link>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4 pb-2">{children}</div>
    </section>
  );
}
