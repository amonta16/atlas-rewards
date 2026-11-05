import Link from "next/link";
import QRCode from "react-qr-code";
import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { TopBar } from "@/components/chrome";
import { IcScan } from "@/components/icons";

export const metadata = { title: "Scan" };

/** Scan tab: the patient's check-in code. The desk scans it to open them and award the visit. */
export default async function Scan({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const base = `/${clinic.slug}`;

  return (
    <>
      <TopBar slug={clinic.slug} title="Scan" />
      {patient.signedIn && patient.memberCode ? (
        <section className="px-6 pt-6 text-center">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Visiting {clinic.name}?</h2>
          <p className="mx-auto mt-2 max-w-[30ch] text-[14.5px] leading-snug text-sub">
            Show this code at the front desk{clinic.visitPoints ? ` and earn ${clinic.visitPoints} points for your visit` : " to check in"}.
          </p>
          <div className="mx-auto mt-7 w-fit rounded-[24px] bg-white p-5 shadow-card ring-1 ring-line">
            <QRCode value={patient.memberCode} size={216} fgColor="#0a0a0a" bgColor="#ffffff" />
          </div>
          <p className="mt-5 font-mono text-[24px] font-semibold tracking-[0.2em]">{patient.memberCode}</p>
          <p className="mt-1 text-[14px] text-sub">{patient.fullName ?? "Your code"} · {patient.points.toLocaleString("en-US")} points</p>
          <Link href={`${base}/rewards`} className="btn-ink mx-auto mt-7 max-w-[320px]">See my points</Link>
        </section>
      ) : (
        <section className="px-8 pt-20 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-page"><IcScan className="h-8 w-8" /></span>
          <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Earn points every visit</h2>
          <p className="mt-2 text-[14.5px] leading-snug text-sub">Sign in to get your check-in code. The front desk scans it when you arrive.</p>
          <Link href={`${base}/login?next=${base}/scan`} className="btn-ink mt-6">Sign up or log in</Link>
        </section>
      )}
    </>
  );
}
