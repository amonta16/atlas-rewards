"use client";
/**
 * GuardianSignClient — CP-137
 *
 * What a parent sees when they open the emailed link. Same document, same
 * signature capture and same single consent line as the in-app screen — the
 * difference is that the person signing is not signed in to anything, and
 * the only thing their signature can unlock is the one child the token names.
 */
import { useState } from "react";
import { CheckCircle2, PenLine, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/customer/signature-pad";

export type GuardianRequest = {
  request_id: string; business_id: string; business_name: string; business_slug: string;
  waiver_id: string; waiver_title: string; version_id: string; version_no: number;
  body_text: string; document_url: string | null;
  minor_name: string; minor_dob: string | null; status: string;
};

const CONSENT =
  "I am the parent or legal guardian of the child named above. I have read and understand this waiver, " +
  "I am signing it voluntarily on their behalf and my own, and I agree to be bound by its terms.";

function ageFrom(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function GuardianSignClient({ request, token }: { request: GuardianRequest; token: string }) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [sig, setSig] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [scrolledEnd, setScrolledEnd] = useState(false);

  const age = ageFrom(dob);
  const adult = age !== null && age >= 18;
  const canSign = name.trim().length >= 2 && adult && agree
    && (mode === "draw" ? !!sig : typed.trim().length >= 2);

  async function sign() {
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc("guardian_sign_waiver", {
      p_token: token,
      p_signer_name: name.trim(),
      p_signer_dob: dob,
      p_signature_data_url: mode === "draw" ? sig : null,
      p_signature_typed: mode === "type" ? typed.trim() : null,
      p_consent_text: CONSENT,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="p-4 pt-10">
        <div className="rounded-3xl bg-white border shadow-sm p-6 text-center">
          <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
          <h1 className="text-2xl font-black mt-4 text-zinc-900">Signed — thank you</h1>
          <p className="text-sm text-zinc-500 mt-2">
            {request.minor_name}&apos;s account at {request.business_name} is unlocked. They may need to reopen the app.
          </p>
          <p className="text-xs text-zinc-400 mt-4">You can close this page.</p>
        </div>
      </div>
    );
  }

  if (request.status !== "pending") {
    return (
      <div className="p-4 pt-10">
        <div className="rounded-3xl bg-white border shadow-sm p-6 text-center">
          <h1 className="text-xl font-black text-zinc-900">
            {request.status === "signed" ? "Already signed" : "This link has expired"}
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            {request.status === "signed"
              ? `Someone has already signed for ${request.minor_name}. Nothing else is needed.`
              : `Ask ${request.minor_name} to send a new link from the app, or sign at the front desk.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pt-6 pb-12">
      <div className="rounded-3xl bg-white border shadow-sm overflow-hidden">
        <div className="px-5 pt-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
            {request.business_name} · version {request.version_no}
          </div>
          <h1 className="text-xl font-black text-zinc-900 mt-1">{request.waiver_title}</h1>
          <p className="text-[13px] text-zinc-600 mt-2">
            You&apos;re signing for <span className="font-bold text-zinc-900">{request.minor_name}</span>
            {request.minor_dob ? ` (born ${request.minor_dob})` : ""}.
          </p>
        </div>

        <div
          className="mx-5 mt-3 max-h-72 overflow-y-auto rounded-xl border bg-zinc-50 p-4 text-[13px] leading-relaxed text-zinc-800 whitespace-pre-line"
          onScroll={(e) => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight >= t.scrollHeight - 8) setScrolledEnd(true); }}
        >
          {request.body_text}
        </div>
        {request.document_url && (
          <a href={request.document_url} target="_blank" rel="noreferrer" className="mx-5 mt-2 inline-block text-xs font-semibold underline text-zinc-600">
            Open the full document
          </a>
        )}
        {!scrolledEnd && <div className="mx-5 mt-1 text-[11px] text-zinc-400">Scroll to the end ↓</div>}

        <div className="px-5 mt-5 space-y-4">
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Your full legal name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Parent or guardian name" className="mt-1.5 h-11" autoComplete="name" />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Your date of birth</label>
            <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className="mt-1.5 h-11" autoComplete="bday" />
            {dob && !adult && <p className="text-[12px] text-amber-700 mt-1.5">Only an adult can sign this.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Signature</label>
              <div className="inline-flex rounded-full bg-zinc-100 p-0.5">
                <button type="button" onClick={() => setMode("draw")} className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${mode === "draw" ? "bg-white shadow text-zinc-900" : "text-zinc-500"}`}><PenLine className="h-3 w-3" /> Draw</button>
                <button type="button" onClick={() => setMode("type")} className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${mode === "type" ? "bg-white shadow text-zinc-900" : "text-zinc-500"}`}><Type className="h-3 w-3" /> Type</button>
              </div>
            </div>
            <div className="mt-1.5">
              {mode === "draw"
                ? <SignaturePad onChange={setSig} primary="#111827" />
                : <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your full name as your signature" className="h-14 text-2xl italic font-serif" />}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 rounded" />
            <span className="text-[12.5px] leading-snug text-zinc-700">{CONSENT}</span>
          </label>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="p-5">
          <Button onClick={sign} disabled={!canSign || busy} className="w-full h-12 text-base font-black text-white bg-zinc-900">
            {busy ? "Recording…" : "Sign for " + request.minor_name}
          </Button>
          <p className="text-[10.5px] text-zinc-400 text-center mt-2">
            Your signature, name, date of birth and the time are stored with version {request.version_no} of this
            document and are visible to {request.business_name} staff.
          </p>
        </div>
      </div>
    </div>
  );
}
