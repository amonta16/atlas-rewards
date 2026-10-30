import Link from "next/link";
import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { getPurchases, type Purchase } from "@/lib/orders";
import { priceLabel } from "@/lib/plans";
import { TopBar } from "@/components/chrome";
import { IcBag, IcCheck, IcGift, IcSpark } from "@/components/icons";

/** My purchases: Shop orders at this clinic, gift card codes and package sessions left. */
export default async function Orders({ params, searchParams }: {
  params: { clinic: string };
  searchParams: { order?: string; paid?: string; reserved?: string; demo?: string };
}) {
  const clinic = (await getClinic(params.clinic))!;
  const base = `/${clinic.slug}`;
  const patient = await getPatient(clinic);
  const all = patient.signedIn ? await getPurchases(clinic) : [];
  // A pending order is a checkout the patient didn't finish, except the one they just paid for (the webhook may be a second behind).
  const list = all.filter((o) => o.status !== "pending" || (o.id === searchParams.order && searchParams.paid));

  return (
    <>
      <TopBar slug={clinic.slug} title="My purchases" />
      {searchParams.paid && (
        <Banner title="Thank you for your order!" body={searchParams.demo ? "Demo clinic: no card was charged." : `${clinic.name} has your order. Show this screen at the front desk.`} />
      )}
      {searchParams.reserved && (
        <Banner title="Reserved" body={`${clinic.name} will have it ready. Pay at the front desk on your next visit.`} />
      )}

      {!patient.signedIn ? (
        <Empty title="Sign in to see your purchases" body="Packages, skincare and gift cards you buy show up here." href={`${base}/login?next=${base}/orders`} cta="Sign up or log in" />
      ) : list.length === 0 ? (
        <Empty title="No purchases yet" body="Treatment packages, skincare and gift cards you buy show up here." href={`${base}/shop?tab=browse`} cta="Browse the shop" />
      ) : (
        <ul className="mx-4 mt-3 space-y-3 pb-4">
          {list.map((o) => <OrderCard key={o.id} o={o} highlight={o.id === searchParams.order} />)}
        </ul>
      )}
    </>
  );
}

const STATUS: Record<Purchase["status"], { label: string; tone: string }> = {
  pending: { label: "Confirming payment…", tone: "bg-page text-sub" },
  reserved: { label: "Reserved · pay at the desk", tone: "bg-amber-50 text-amber-800" },
  paid: { label: "Paid", tone: "bg-emerald-50 text-emerald-800" },
  fulfilled: { label: "Picked up", tone: "bg-page text-sub" },
  cancelled: { label: "Cancelled", tone: "bg-page text-sub" },
  refunded: { label: "Refunded", tone: "bg-page text-sub" },
};

function OrderCard({ o, highlight }: { o: Purchase; highlight: boolean }) {
  const s = STATUS[o.status];
  const Icon = o.kind === "gift_card" ? IcGift : o.kind === "package" ? IcSpark : IcBag;
  const paid = o.status === "paid" || o.status === "fulfilled";
  return (
    <li className={`rounded-card bg-white p-4 shadow-card ${highlight ? "ring-2 ring-ink" : ""}`}>
      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-page"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug">{o.item_name}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</p>
          <p className="mt-0.5 text-[13.5px] text-sub">
            {priceLabel(o.amount_cents)} · {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold ${s.tone}`}>{s.label}</span>
        </div>
      </div>

      {o.kind === "package" && o.sessions_total ? (
        <div className="mt-4 rounded-[14px] bg-page px-4 py-3">
          <div className="flex items-baseline justify-between text-[14px]">
            <span className="font-semibold">Sessions left</span>
            <span className="tabular-nums text-sub">{o.sessions_total - o.sessions_used} of {o.sessions_total}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-ink" style={{ width: `${((o.sessions_total - o.sessions_used) / o.sessions_total) * 100}%` }} />
          </div>
        </div>
      ) : null}

      {o.kind === "gift_card" && o.gift_code && (
        paid ? (
          <div className="mt-4 rounded-[14px] bg-ink px-4 py-4 text-white">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/60">Gift code{o.recipient_name ? ` for ${o.recipient_name}` : ""}</p>
            <p className="mt-1 font-mono text-[24px] font-semibold tracking-[0.12em]">{o.gift_code}</p>
            {o.gift_balance_cents != null && <p className="mt-1 text-[13px] text-white/70">Balance {priceLabel(o.gift_balance_cents)} · show this code at the front desk</p>}
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] text-sub">Your gift code appears here once it&apos;s paid.</p>
        )
      )}
    </li>
  );
}

function Banner({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-4 mt-3 flex gap-3 rounded-card bg-ink p-5 text-white shadow-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15"><IcCheck className="h-5 w-5" /></span>
      <div>
        <p className="text-[17px] font-semibold">{title}</p>
        <p className="mt-1 text-[14px] leading-snug text-white/75">{body}</p>
      </div>
    </section>
  );
}

function Empty({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <section className="mx-4 mt-3 rounded-card bg-white p-6 text-center shadow-card">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-page"><IcBag className="h-6 w-6" /></span>
      <p className="mt-3 text-[19px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[14.5px] text-sub">{body}</p>
      <Link href={href} className="btn-ink mt-5">{cta}</Link>
    </section>
  );
}
