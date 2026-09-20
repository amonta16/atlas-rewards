"use client";
/**
 * KioskWaiverClient — CP-142.
 *
 * The walk-in signing form for a tablet at the counter. Three things make it
 * different from the in-app waiver screen:
 *
 *   · Nobody is logged in. Identity IS the form: name and date of birth are
 *     required, phone and email are offered but never demanded.
 *   · Every field that the database requires is gated HERE too, with the
 *     missing field named. The in-app form's bug was letting the button fire
 *     and surfacing a raw database error; a person holding a tablet at a
 *     counter deserves better than that.
 *   · It resets for the next person. The confirmation waits for a tap
 *     (Andrew's call) so a distracted customer can't hand the next one a
 *     half-finished form.
 */
import { useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, PenLine, Type, Plus, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/customer/signature-pad";
import type { Business } from "@/lib/types/database";

type Waiver = {
  waiver_id: string; waiver_title: string; version_id: string;
  version_no: number; body_text: string; minors_enabled: boolean;
};
type Minor = { first: string; last: string; dob: string };

const CONSENT =
  "I have read and understand this waiver, I am signing it voluntarily, and I agree to be bound by its terms.";

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

export function KioskWaiverClient({ business, waiver }: { business: Business; waiver: Waiver }) {
  const primary = business.brand_colors?.primary ?? "#2563eb";

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [minors, setMinors] = useState<Minor[]>([]);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [sig, setSig] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  const age = ageFrom(dob);
  const cleanMinors = minors.filter(m => m.first.trim() && m.last.trim());

  /**
   * Every reason the form is not ready, named. This is the fix for "people
   * can submit stuff blank" — the in-app form only checked the name and the
   * consent box, so a missing signature or date of birth sailed through to
   * the server and came back as a raw error.
   */
  const problems = useMemo(() => {
    const out: string[] = [];
    if (name.trim().length < 2) out.push("Enter the full name");
    if (!dob) out.push("Enter the date of birth");
    else if (age === null) out.push("Check the date of birth");
    else if (age < 18) out.push("The person signing has to be 18 or older");
    else if (age > 120) out.push("Check the date of birth");
    if (mode === "draw" && !sig) out.push("Add a signature");
    if (mode === "type" && typed.trim().length < 2) out.push("Type the full name as a signature");
    if (minors.some(m => (m.first.trim() ? 0 : 1) + (m.last.trim() ? 0 : 1) === 1)) {
      out.push("Every child needs a first and last name");
    }
    if (!agree) out.push("Tick the box to agree");
    return out;
  }, [name, dob, age, mode, sig, typed, minors, agree]);

  const ready = problems.length === 0;

  async function submit() {
    if (!ready) { setShowErrors(true); topRef.current?.scrollIntoView({ behavior: "smooth" }); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/waivers/kiosk-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: business.id,
        waiverId: waiver.waiver_id,
        versionId: waiver.version_id,
        name: name.trim(),
        dob,
        phone: phone.trim(),
        email: email.trim(),
        signatureDataUrl: mode === "draw" ? sig : null,
        signatureTyped: mode === "type" ? typed.trim() : null,
        consentText: CONSENT,
        minors: cleanMinors,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const msg = res ? ((await res.json().catch(() => null))?.error ?? "Something went wrong.") : "Network problem — try again.";
      setErr(msg);
      return;
    }
    setDone(name.trim());
  }

  function nextPerson() {
    setName(""); setDob(""); setPhone(""); setEmail(""); setMinors([]);
    setSig(null); setTyped(""); setMode("draw"); setAgree(false);
    setErr(null); setShowErrors(false); setDone(null);
    topRef.current?.scrollIntoView();
  }

  // ── confirmation ──────────────────────────────────────────────────────────
  if (done) {
    const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/signup` : "";
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white rounded-3xl border shadow-sm p-8 text-center">
          <div
            className="h-20 w-20 rounded-full mx-auto flex items-center justify-center text-white"
            style={{ background: primary }}
          >
            <CheckCircle2 className="h-11 w-11" />
          </div>
          <h1 className="text-3xl font-black mt-5 text-zinc-900">You&apos;re all set</h1>
          <p className="text-zinc-600 mt-1 text-lg">
            Thanks, {done}. Your waiver is signed{cleanMinors.length > 0 ? ` for you and ${cleanMinors.length} ${cleanMinors.length === 1 ? "child" : "children"}` : ""}.
          </p>

          {joinUrl && (
            <div className="mt-7 rounded-2xl border-2 border-dashed p-5" style={{ borderColor: `${primary}55` }}>
              <div className="text-sm font-black uppercase tracking-wider" style={{ color: primary }}>
                Want the app?
              </div>
              <p className="text-sm text-zinc-600 mt-1">
                Scan with your phone camera to join {business.name} and start earning rewards.
              </p>
              <div className="bg-white p-3 rounded-xl inline-block mt-3">
                <QRCode value={joinUrl} size={148} />
              </div>
            </div>
          )}

          <Button
            onClick={nextPerson}
            className="w-full h-16 mt-7 text-lg font-black text-white"
            style={{ background: primary }}
          >
            Next person
          </Button>
        </div>
      </div>
    );
  }

  // ── the form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50 p-5 sm:p-8">
      <div ref={topRef} className="max-w-2xl mx-auto">
        <div className="text-center mb-5">
          {business.logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={business.logo_url} alt="" className="h-14 mx-auto object-contain mb-3" />
          )}
          <h1 className="text-3xl font-black text-zinc-900">{waiver.waiver_title}</h1>
          <p className="text-zinc-500 mt-1">Please read and sign before you play.</p>
        </div>

        {showErrors && problems.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 mb-4 text-left">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertCircle className="h-4 w-4" /> Still needed
            </div>
            <ul className="mt-1.5 text-sm text-amber-900 list-disc pl-5 space-y-0.5">
              {problems.map(p => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border bg-white p-4 mb-4 max-h-72 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
          {waiver.body_text}
        </div>

        <div className="rounded-2xl border bg-white p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Full name *</span>
              <Input className="h-14 text-lg mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Date of birth *</span>
              <Input className="h-14 text-lg mt-1" type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Phone <span className="font-normal text-zinc-400">(optional)</span></span>
              <Input className="h-14 text-lg mt-1" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(661) 555-0100" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Email <span className="font-normal text-zinc-400">(optional)</span></span>
              <Input className="h-14 text-lg mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
            </label>
          </div>

          {waiver.minors_enabled && (
            <div className="rounded-xl border p-4 bg-zinc-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-700">Signing for children too?</span>
                <Button variant="outline" className="h-11"
                  onClick={() => setMinors([...minors, { first: "", last: "", dob: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add a child
                </Button>
              </div>
              {minors.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3">
                  <Input className="h-12" placeholder="First name" value={m.first}
                    onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, first: e.target.value } : x))} />
                  <Input className="h-12" placeholder="Last name" value={m.last}
                    onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, last: e.target.value } : x))} />
                  <button onClick={() => setMinors(minors.filter((_, j) => j !== i))}
                    className="h-12 w-12 rounded-lg bg-white border flex items-center justify-center">
                    <X className="h-4 w-4 text-zinc-500" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-zinc-700">Signature *</span>
              <div className="flex gap-1">
                <Button variant={mode === "draw" ? "default" : "outline"} className="h-11" onClick={() => setMode("draw")}>
                  <PenLine className="h-4 w-4 mr-1" /> Draw
                </Button>
                <Button variant={mode === "type" ? "default" : "outline"} className="h-11" onClick={() => setMode("type")}>
                  <Type className="h-4 w-4 mr-1" /> Type
                </Button>
              </div>
            </div>
            {mode === "draw"
              ? <SignaturePad onChange={setSig} height={180} primary={primary} />
              : <Input className="h-16 text-2xl" style={{ fontFamily: "cursive" }} value={typed}
                  onChange={e => setTyped(e.target.value)} placeholder="Type your full name" />}
          </div>

          <label className="flex items-start gap-3 rounded-xl border p-4 cursor-pointer">
            <input type="checkbox" className="h-6 w-6 mt-0.5 shrink-0" checked={agree}
              onChange={e => setAgree(e.target.checked)} />
            <span className="text-[15px] text-zinc-700">{CONSENT}</span>
          </label>

          {err && <p className="text-red-600 font-medium">{err}</p>}

          <Button onClick={submit} disabled={busy}
            className="w-full h-16 text-lg font-black text-white disabled:opacity-60"
            style={{ background: primary }}>
            {busy ? "Signing…" : "Sign and finish"}
          </Button>
          {!ready && (
            <p className="text-center text-xs text-zinc-400">
              {problems.length} thing{problems.length === 1 ? "" : "s"} still needed
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
