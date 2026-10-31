"use client";
/**
 * Redeem in the app: confirm → points become a voucher with a QR code the
 * front desk scans (same codes as the venue app, so the desk scanner and
 * manual code entry work unchanged). Guests hit the sign-in prompt first.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { useGate } from "./gate";
import { IcClose } from "./icons";
import { Portal } from "./portal";

type Stage = "confirm" | "busy" | "done";

export function RedeemButton({ slug, rewardId, reward, cost, points, ready }: {
  slug: string; rewardId: string; reward: string; cost: number; points: number; ready: boolean;
}) {
  const { require } = useGate();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  async function redeem() {
    setStage("busy"); setError(null);
    const res = await fetch(`/api/${slug}/redeem`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rewardId }) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { code?: string; error?: string } | undefined;
    if (data?.code) { setCode(data.code); setStage("done"); router.refresh(); return; }
    setError(data?.error ?? "No connection. Please try again."); setStage("confirm");
  }
  const close = () => { setOpen(false); setStage("confirm"); setError(null); };

  return (
    <>
      <button type="button" disabled={!ready} onClick={() => require(() => setOpen(true))}
        className={`h-9 rounded-full px-4 text-[13.5px] font-semibold ${ready ? "bg-black text-white" : "bg-page text-faint"}`}>
        Redeem
      </button>
      {open && (
        <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-6" onClick={close}>
          <div role="dialog" aria-modal className="relative w-full max-w-[340px] animate-rise rounded-[24px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
            {stage !== "done" ? (
              <>
                <p className="eyebrow">Redeem reward</p>
                <h2 className="mt-2 text-[21px] font-semibold leading-tight">{reward}</h2>
                <p className="mt-3 text-[14.5px] text-sub">Use <b className="text-ink">{cost.toLocaleString("en-US")} points</b>. You&apos;ll have {(points - cost).toLocaleString("en-US")} left.</p>
                {error && <p className="mt-3 text-[13.5px] text-red-600">{error}</p>}
                <button type="button" className="btn-ink mt-5" disabled={stage === "busy"} onClick={redeem}>{stage === "busy" ? "Redeeming…" : "Redeem now"}</button>
                <p className="mt-3 text-[12.5px] text-faint">You&apos;ll get a code to show at the front desk.</p>
              </>
            ) : (
              <VoucherBody reward={reward} code={code!} />
            )}
          </div>
        </div></Portal>
      )}
    </>
  );
}

export function VoucherBody({ reward, code, expiresAt }: { reward: string; code: string; expiresAt?: string | null }) {
  return (
    <>
      <p className="eyebrow">Show the front desk</p>
      <h2 className="mt-2 text-[21px] font-semibold leading-tight">{reward}</h2>
      <div className="mx-auto mt-5 w-fit rounded-[18px] bg-white p-3 ring-1 ring-line"><QRCode value={code} size={168} fgColor="#0a0a0a" bgColor="#ffffff" /></div>
      <p className="mt-4 font-mono text-[26px] font-semibold tracking-[0.18em]">{code}</p>
      <p className="mt-2 text-[13px] text-sub">
        Staff scan this or type the code.{expiresAt ? ` Use by ${new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""} It&apos;s saved in Rewards.
      </p>
    </>
  );
}

/** "Ready to use": a saved voucher; tap to show its QR again. */
export function VoucherRow({ reward, code, expiresAt }: { reward: string; code: string; expiresAt: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 rounded-card bg-white p-4 text-left shadow-card">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-ink p-1.5"><QRCode value={code} size={36} fgColor="#ffffff" bgColor="#171B26" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold">{reward}</span>
          <span className="block font-mono text-[13px] tracking-[0.12em] text-sub">{code}</span>
        </span>
        <span className="rounded-full bg-black px-3.5 py-2 text-[13px] font-semibold text-white">Show</span>
      </button>
      {open && (
        <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-6" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal className="relative w-full max-w-[340px] animate-rise rounded-[24px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
            <VoucherBody reward={reward} code={code} expiresAt={expiresAt} />
          </div>
        </div></Portal>
      )}
    </>
  );
}
