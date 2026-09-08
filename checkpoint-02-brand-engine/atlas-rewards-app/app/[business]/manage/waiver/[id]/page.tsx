/**
 * Printable signed-waiver record — CP-135
 *
 * /<slug>/manage/waiver/<submission-id>
 *
 * Renders the EXACT waiver text the customer agreed to (the immutable
 * version row, not today's edit), the consent line, the drawn or typed
 * signature, and the audit metadata (timestamp, version, SHA-256 of the
 * body, user agent). The manage layout already gates this route to staff /
 * managers / agency; get_waiver_submission re-checks at the data layer and
 * refuses cross-tenant ids.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type Rec = {
  id: string; business_id: string; business_name: string; signed_at: string;
  signer_name: string | null; signer_email: string | null;
  signature_data_url: string | null; signature_typed: string | null;
  consent_text: string; body_sha256: string; user_agent: string | null;
  waiver_title: string; version_no: number; version_text: string; version_created_at: string;
  campaign_title: string | null; member_name: string | null; member_phone: string | null;
};

export default async function WaiverRecordPage({ params }: { params: { business: string; id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_waiver_submission", { p_id: params.id });
  const rec = (Array.isArray(data) ? data[0] : data) as Rec | undefined;
  if (!rec) notFound();

  // Belt and braces: the URL's business slug must match the record's business.
  const { data: biz } = await supabase.from("businesses").select("id").eq("slug", params.business).single();
  if (!biz || biz.id !== rec.business_id) notFound();

  const signed = new Date(rec.signed_at);
  const fmt = (d: Date) => d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

  return (
    <main className="min-h-screen bg-zinc-100 print:bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8 print:py-0 print:px-0">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <a href={`/${params.business}/manage`} className="text-sm text-muted-foreground hover:underline">← Back to front desk</a>
          <PrintButton />
        </div>

        <article className="bg-white rounded-2xl shadow-sm border p-8 print:shadow-none print:border-0 print:p-0">
          <header className="border-b pb-5 mb-6">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">{rec.business_name}</div>
            <h1 className="text-2xl font-black tracking-tight mt-1">{rec.waiver_title}</h1>
            <div className="text-xs text-zinc-500 mt-1">
              Version {rec.version_no} · published {new Date(rec.version_created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {rec.campaign_title && <> · via campaign “{rec.campaign_title}”</>}
            </div>
          </header>

          <section className="grid sm:grid-cols-2 gap-4 text-sm mb-6">
            <Field label="Signer">{rec.signer_name ?? "—"}{rec.signer_email && <div className="text-zinc-500 text-xs">{rec.signer_email}</div>}</Field>
            <Field label="Member account">{rec.member_name ?? "—"}{rec.member_phone && <div className="text-zinc-500 text-xs">{rec.member_phone}</div>}</Field>
            <Field label="Signed">{fmt(signed)}</Field>
            <Field label="Record id"><span className="font-mono text-xs break-all">{rec.id}</span></Field>
          </section>

          <section className="mb-6">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Agreement text (as signed)</div>
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-800 rounded-xl bg-zinc-50 border p-4 print:bg-white print:border-zinc-300">
              {rec.version_text}
            </div>
          </section>

          <section className="mb-6">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Consent</div>
            <p className="text-[13px] text-zinc-800">☑ {rec.consent_text}</p>
          </section>

          <section className="mb-6">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Signature</div>
            {rec.signature_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rec.signature_data_url} alt="Signature" className="h-28 max-w-full border-b border-zinc-400" />
            ) : (
              <div className="font-serif italic text-2xl text-zinc-900 border-b border-zinc-400 inline-block pr-8 pb-1">{rec.signature_typed ?? "—"}</div>
            )}
            <div className="text-xs text-zinc-500 mt-1">{rec.signer_name ?? ""} · {fmt(signed)}</div>
          </section>

          <footer className="border-t pt-4 text-[10px] text-zinc-500 font-mono break-all space-y-0.5">
            <div>Document SHA-256: {rec.body_sha256}</div>
            {rec.user_agent && <div>Device: {rec.user_agent}</div>}
          </footer>
        </article>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">{label}</div>
      <div className="font-semibold">{children}</div>
    </div>
  );
}
