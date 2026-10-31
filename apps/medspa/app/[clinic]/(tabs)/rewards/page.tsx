import Link from "next/link";
import { optimizedUrl } from "@atlas/core/img";
import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { TopBar, Wordmark } from "@/components/chrome";
import { RedeemButton, VoucherRow } from "@/components/redeem-button";
import { getVouchers } from "@/lib/vouchers";

export default async function Rewards({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const vouchers = patient.signedIn ? await getVouchers(clinic) : [];
  const next = clinic.rewards.find((r) => r.point_cost > patient.points) ?? null;
  const pct = next ? Math.min(100, Math.round((patient.points / next.point_cost) * 100)) : 100;

  return (
    <>
      <TopBar slug={clinic.slug} title="Rewards" />
      <section className="relative mx-4 mt-3 overflow-hidden rounded-[22px] bg-ink p-5 text-white shadow-card">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand/40 blur-3xl" />
        <Wordmark name={clinic.name} logoUrl={null} invert />
        <p className="mt-6 text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{patient.points.toLocaleString("en-US")}</p>
        <p className="mt-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/60">Points</p>
        {patient.signedIn ? (
          next && (
            <div className="mt-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} /></div>
              <p className="mt-2 text-[13.5px] text-white/75">{(next.point_cost - patient.points).toLocaleString("en-US")} points to {next.name}</p>
            </div>
          )
        ) : (
          <Link href={`/${clinic.slug}/login?next=/${clinic.slug}/rewards`} className="mt-5 inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-ink">Sign in to start earning</Link>
        )}
      </section>

      {vouchers.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="px-1 text-[19px] font-semibold tracking-[-0.01em]">Ready to use</h2>
          <div className="mt-3 space-y-3">
            {vouchers.map((v) => <VoucherRow key={v.id} reward={v.reward_name} code={v.code} expiresAt={v.expires_at} />)}
          </div>
        </section>
      )}

      <p className="mx-5 mt-6 text-[14px] text-sub">Earn points every visit, purchase and review. Spend them here.</p>

      <div className="mt-3 space-y-3 px-4">
        {clinic.rewards.map((r) => {
          const ready = patient.signedIn && patient.points >= r.point_cost;
          return (
            <div key={r.id} id={r.id} className="flex scroll-mt-24 items-center gap-3.5 rounded-card bg-white p-3 shadow-card">
              <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[14px] bg-page">
                {r.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedUrl(r.image_url, 160)} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{r.name}</p>
                <p className="mt-1 text-[13px] text-sub">{r.point_cost.toLocaleString("en-US")} pts</p>
              </div>
              <RedeemButton slug={clinic.slug} rewardId={r.id} reward={r.name} cost={r.point_cost} points={patient.points} ready={ready || !patient.signedIn} />
            </div>
          );
        })}
        {clinic.rewards.length === 0 && <p className="py-14 text-center text-[15px] text-sub">Rewards are coming soon.</p>}
      </div>
    </>
  );
}
