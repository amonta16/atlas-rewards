import Link from "next/link";
import { NotifyCard } from "@/components/notifications";
import { optimizedUrl } from "@atlas/core/img";
import { activeTreatments, getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { bookingOptions } from "@/lib/medspa";
import { fromPrice } from "@/lib/plans";
import { TopBar, Wordmark } from "@/components/chrome";
import { ActionButton } from "@/components/action-sheet";
import { IcCalendar, IcNext, IcPin } from "@/components/icons";

export default async function Home({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const base = `/${clinic.slug}`;
  const treatments = activeTreatments(clinic).slice(0, 8);
  const gallery = clinic.cfg.gallery.filter((g) => g.consent && g.before_url && g.after_url).slice(0, 6);
  const book = bookingOptions(clinic.cfg.booking, clinic.name, clinic.phone, null);

  return (
    <>
      <TopBar slug={clinic.slug} wordmark={<Wordmark name={clinic.name} logoUrl={clinic.logoUrl} />} />

      {/* Hero + wallet */}
      <section className="relative">
        <div className="relative h-[300px] overflow-hidden bg-ink">
          {clinic.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedUrl(clinic.heroUrl, 900)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/35" />
          <h2 className="absolute left-5 right-5 top-6 animate-rise text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-white">
            {patient.signedIn ? `Welcome back, ${patient.firstName ?? "there"}!` : "Welcome back, Guest!"}
          </h2>
        </div>
        <Link
          href={patient.signedIn ? `${base}/rewards` : `${base}/login`}
          className="relative z-10 mx-4 -mt-9 flex items-center gap-3 rounded-card bg-white px-4 py-3.5 shadow-card"
        >
          <span className="text-[17px] font-bold tabular-nums">{patient.points.toLocaleString("en-US")}</span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-sub">points</span>
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] ${patient.isMember ? "bg-brand text-white" : "bg-page text-sub"}`}>
            {patient.isMember ? (patient.planName ?? "Member") : "Not a member"}
          </span>
          <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
        </Link>
      </section>

      {patient.signedIn && <NotifyCard clinicId={clinic.id} clinicName={clinic.name} slug={clinic.slug} demo={clinic.isExample && clinic.id === "example"} />}

      {/* Membership promo */}
      {clinic.plans.length > 0 && (
        <section className="mx-4 mt-4 rounded-card bg-white p-5 shadow-card">
          <h3 className="max-w-[16ch] text-[23px] font-semibold leading-[1.15] tracking-[-0.015em]">
            {patient.isMember ? "Your membership perks" : `Save big as a ${clinic.name} member`}
          </h3>
          <p className="mt-2 text-[14.5px] text-sub">
            {patient.isMember ? "Everything included this month, in one place." : "Treatments every month. Member pricing. Exclusive perks."}
          </p>
          <Link href={`${base}/shop?tab=memberships`} className="mt-4 inline-flex h-10 items-center rounded-full bg-black px-5 text-[14px] font-semibold text-white">See benefits</Link>
        </section>
      )}

      {/* Rewards rail */}
      {clinic.rewards.length > 0 && (
        <Rail title="Rewards" href={`${base}/rewards`}>
          {clinic.rewards.slice(0, 8).map((r) => (
            <Link key={r.id} href={`${base}/rewards#${r.id}`} className="w-[150px] shrink-0">
              <div className="aspect-square overflow-hidden rounded-[16px] bg-white shadow-card">
                {r.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={optimizedUrl(r.image_url, 300)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : <div className="grid h-full place-items-center bg-ink"><Wordmark name={clinic.name} logoUrl={null} invert /></div>}
              </div>
              <p className="mt-2 line-clamp-2 text-[14px] font-medium leading-snug">{r.name}</p>
              <p className="mt-0.5 text-[13px] text-sub">{r.point_cost.toLocaleString("en-US")} pts</p>
            </Link>
          ))}
        </Rail>
      )}

      {/* Popular treatments */}
      {treatments.length > 0 && (
        <Rail title="Popular treatments" href={`${base}/shop?tab=treatments`}>
          {treatments.map((t) => (
            <Link key={t.id} href={`${base}/shop/treatment/${t.id}`} className="w-[230px] shrink-0 overflow-hidden rounded-card bg-white shadow-card">
              <div className="aspect-[16/10] bg-tint">
                {t.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedUrl(t.image_url, 460)} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="p-3.5">
                <p className="eyebrow">{t.category}</p>
                <p className="mt-1 truncate text-[15.5px] font-semibold">{t.name}</p>
                <p className="mt-1 text-[13.5px] text-sub">{fromPrice(t)}</p>
              </div>
            </Link>
          ))}
        </Rail>
      )}

      {/* Book */}
      <section className="mx-4 mt-7">
        <ActionButton
          label="Book your next visit"
          options={book}
          sheet={{ title: "Book your next visit", body: `Choose how you'd like to book with ${clinic.name}.` }}
          className="flex w-full items-center gap-3.5 rounded-card bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black text-white"><IcCalendar className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">Book your next visit</span>
            <span className="block text-[13.5px] text-sub">Online, by text, or give us a call</span>
          </span>
          <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
        </ActionButton>
      </section>

      {/* Results */}
      {gallery.length > 0 && (
        <Rail title="Real results" href={`${base}/shop?tab=treatments`}>
          {gallery.map((g) => (
            <figure key={g.id} className="w-[260px] shrink-0 overflow-hidden rounded-card bg-white shadow-card">
              <div className="grid grid-cols-2 gap-px bg-line">
                {[["Before", g.before_url], ["After", g.after_url]].map(([label, url]) => (
                  <div key={label} className="relative aspect-[4/5] bg-tint">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={optimizedUrl(url, 260)} alt={`${label}: ${g.caption}`} className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white">{label}</span>
                  </div>
                ))}
              </div>
              <figcaption className="px-3.5 py-3">
                <p className="truncate text-[14.5px] font-semibold">{g.title}</p>
                <p className="truncate text-[13px] text-sub">{g.caption}</p>
              </figcaption>
            </figure>
          ))}
        </Rail>
      )}

      {/* Visit */}
      {(clinic.address || clinic.phone) && (
        <section className="mx-4 mt-7 flex items-start gap-3 rounded-card bg-white p-4 shadow-card">
          <IcPin className="mt-0.5 h-5 w-5 shrink-0 text-sub" />
          <div className="text-[14.5px]">
            <p className="font-semibold">{clinic.name}</p>
            {clinic.address && <p className="text-sub">{clinic.address}</p>}
            {clinic.phone && <a href={`tel:${clinic.phone}`} className="text-sub underline-offset-2">{clinic.phone}</a>}
          </div>
        </section>
      )}
    </>
  );
}

function Rail({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between px-5">
        <h3 className="text-[21px] font-semibold tracking-[-0.015em]">{title}</h3>
        <Link href={href} className="flex items-center gap-0.5 text-[14px] font-medium text-ink">See more <IcNext className="h-3.5 w-3.5" strokeWidth={2.4} /></Link>
      </div>
      <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-5 pb-2">{children}</div>
    </section>
  );
}
