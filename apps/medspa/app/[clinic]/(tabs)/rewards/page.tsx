import Link from "next/link";
import { cookies } from "next/headers";
import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { TopBar, Wordmark } from "@/components/chrome";
import { VoucherRow } from "@/components/redeem-button";
import { getVouchers } from "@/lib/vouchers";
import { getSavedGifts } from "@/lib/gifts";
import { GiftRow } from "@/components/gift-code";
import { NeedMorePoints, RewardsBoard } from "@/components/rewards-board";
import { DEMO_REVIEW_COOKIE } from "@/lib/orders";

export default async function Rewards({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const demo = clinic.isExample && clinic.id === "example";
  const [vouchers, gifts] = patient.signedIn ? await Promise.all([getVouchers(clinic), getSavedGifts(clinic)]) : [[], []];
  const next = clinic.rewards.find((r) => r.point_cost > patient.points) ?? null;

  return (
    <>
      <TopBar slug={clinic.slug} title="Rewards" />

      {/* Loyalty card */}
      <section className="px-4 pt-1">
        <div className="card-metal relative aspect-[1.72] overflow-hidden rounded-[16px] p-5 text-white shadow-[0_18px_34px_-22px_rgba(70,50,30,.9)]">
          <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_18%_8%,rgba(255,255,255,.28),transparent_60%)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="text-[38px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{patient.points.toLocaleString("en-US")}</p>
              <p className="mt-1 text-[12.5px] font-medium text-white/85">{clinic.name} points</p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{patient.signedIn ? (patient.fullName ?? "Member") : "Guest"}</p>
                <div className="mt-1"><Wordmark name={clinic.name} logoUrl={null} size="sm" invert /></div>
              </div>
              {patient.isMember
                ? <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink">{patient.planName ?? "Member"}</span>
                : !patient.signedIn && <Link href={`/${clinic.slug}/login?next=/${clinic.slug}/rewards`} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink">Sign in</Link>}
            </div>
          </div>
        </div>
        {patient.signedIn && next && (
          <p className="mt-2.5 px-1 text-center text-[13px] text-sub">{(next.point_cost - patient.points).toLocaleString("en-US")} points to {next.name}</p>
        )}
      </section>

      {vouchers.length + gifts.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="px-1 text-[19px] font-semibold tracking-[-0.015em]">Ready to use</h2>
          <div className="mt-3 space-y-3">
            {gifts.map((g) => <GiftRow key={g.saved_id} title={g.gift_reward_name ?? g.title} code={g.redeem_code} expiresAt={g.expires_at} />)}
            {vouchers.map((v) => <VoucherRow key={v.id} reward={v.reward_name} code={v.code} expiresAt={v.expires_at} />)}
          </div>
        </section>
      )}

      <RewardsBoard slug={clinic.slug} rewards={clinic.rewards} points={patient.points} signedIn={patient.signedIn} />

      <NeedMorePoints
        slug={clinic.slug} clinicName={clinic.name} rate={clinic.pointsPerDollar} visit={clinic.visitPoints}
        review={clinic.reviewPoints} referral={clinic.referralPoints} reviewUrl={clinic.googleReviewUrl}
        memberCode={patient.memberCode} demo={demo} reviewDone={demo && !!cookies().get(DEMO_REVIEW_COOKIE)?.value}
      />
    </>
  );
}
