import Link from "next/link";
import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { TopBar } from "@/components/chrome";
import { formatPhone } from "@/lib/format";
import { IcBag, IcCheck, IcNext, IcOut, IcPhone, IcSwap, IcUser } from "@/components/icons";
import { ManageMembershipRow } from "@/components/subscribe-button";
import { BookNext } from "@/components/book-next";
import { NotifyRow } from "@/components/notifications";
import { bookFor, planFirstTreatment } from "@/lib/booking";

const SITE = "https://www.atlas-engine.app";

export default async function Profile({ params, searchParams }: { params: { clinic: string }; searchParams: { membership?: string; demo?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const base = `/${clinic.slug}`;
  const justJoined = searchParams.membership === "success";

  return (
    <>
      <TopBar slug={clinic.slug} title="Profile" />
      {justJoined && (
        <section className="mx-4 mt-3 flex gap-3 rounded-card bg-ink p-5 text-white shadow-card">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15"><IcCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-[17px] font-semibold">Welcome to the membership!</p>
            <p className="mt-1 text-[14px] leading-snug text-white/75">
              {searchParams.demo
                ? "Demo clinic: no card was charged."
                : patient.isMember
                  ? `Your payment went through. ${clinic.name} will see you're a member at your next visit.`
                  : "Your payment went through. Your membership will show here in a minute; pull down to refresh."}
            </p>
          </div>
        </section>
      )}
      {justJoined && (
        <BookNext
          title="Book your first visit"
          body={`Your ${patient.planName ?? "membership"} benefits start now. Pick a time with ${clinic.name}.`}
          options={bookFor(clinic, planFirstTreatment(clinic, patient.planName),
            `Hi {practice}! I just joined the ${patient.planName ?? "membership"} in the app and I'd like to book my first visit.`)}
        />
      )}
      {patient.signedIn ? (
        <section className="mx-4 mt-3 rounded-card bg-white p-5 shadow-card">
          <div className="flex items-center gap-3.5">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-[20px] font-semibold text-white">
              {(patient.firstName ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[20px] font-semibold">{patient.fullName ?? "Your account"}</p>
              <p className="text-[14px] text-sub">{formatPhone(patient.phone)}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="Points" value={patient.points.toLocaleString("en-US")} />
            <Stat label="Membership" value={patient.isMember ? (patient.planName ?? "Active") : "Not a member"} />
          </div>
        </section>
      ) : (
        <section className="mx-4 mt-3 rounded-card bg-white p-5 shadow-card">
          <p className="text-[21px] font-semibold leading-tight">Sign in to {clinic.name}</p>
          <p className="mt-1.5 text-[14.5px] text-sub">Earn points every visit, join a membership and book in seconds.</p>
          <Link href={`${base}/login?next=${base}/profile`} className="btn-ink mt-4">Sign up or log in</Link>
        </section>
      )}

      <ul className="mx-4 mt-4 divide-y divide-line overflow-hidden rounded-card bg-white shadow-card">
        {!patient.isMember && clinic.plans.length > 0 && <Row href={`${base}/shop?tab=memberships`} Icon={IcUser} label="Become a member" />}
        {patient.isMember && !clinic.isExample && (
          <ManageMembershipRow slug={clinic.slug} phone={clinic.phone}>
            <IcUser className="h-5 w-5 text-sub" />
            <span className="flex-1 text-[15.5px] font-medium">Manage membership</span>
            <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
          </ManageMembershipRow>
        )}
        {patient.signedIn && clinic.cfg.shop.enabled && <Row href={`${base}/orders`} Icon={IcBag} label="My purchases" />}
        {patient.signedIn && <NotifyRow clinicId={clinic.id} clinicName={clinic.name} demo={clinic.isExample && clinic.id === "example"} />}
        {clinic.phone && <Row href={`tel:${clinic.phone}`} Icon={IcPhone} label={`Call ${clinic.name}`} />}
        <Row href="/find?change=1" Icon={IcSwap} label="Change location" />
        {patient.signedIn && <Row href="/auth/signout" Icon={IcOut} label="Sign out" prefetch={false} />}
      </ul>

      <div className="mx-6 mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-sub">
        <a href={`${SITE}/legal/terms`} target="_blank" rel="noopener noreferrer">Terms of Service</a>
        <a href={`${SITE}/legal/privacy`} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        {patient.signedIn && <a href={`${SITE}/account/delete`} target="_blank" rel="noopener noreferrer">Delete account</a>}
      </div>
      <p className="mx-6 mt-6 text-[12px] text-faint">Powered by Atlas</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-page px-4 py-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-sub">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold">{value}</p>
    </div>
  );
}

function Row({ href, Icon, label, prefetch }: { href: string; Icon: typeof IcUser; label: string; prefetch?: boolean }) {
  return (
    <li>
      <Link href={href} prefetch={prefetch} className="flex items-center gap-3.5 px-4 py-4">
        <Icon className="h-5 w-5 text-sub" />
        <span className="flex-1 text-[15.5px] font-medium">{label}</span>
        <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
      </Link>
    </li>
  );
}
