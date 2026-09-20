"use client";
/**
 * KioskWaiverClient — CP-142, restepped in CP-144.
 *
 * The walk-in signing form for a tablet at the counter. Three things make it
 * different from the in-app waiver screen:
 *
 *   · Nobody is logged in. Identity IS the form: name and date of birth are
 *     required, phone is offered but never demanded.
 *   · Every field that the database requires is gated HERE too, with the
 *     missing field named. Letting the button fire and surfacing a raw
 *     database error is not something to do to a person holding a tablet at a
 *     counter.
 *   · It resets for the next person. The confirmation waits for a tap
 *     (Andrew's call) so a distracted customer can't hand the next one a
 *     half-finished form.
 *
 * CP-144 — one question at a time.
 * The first version put the document, four identity fields, the children rows,
 * the signature pad and the consent box on a single scroll, then listed every
 * unmet requirement in an amber box at the top. That box was an admission: the
 * form was asking so much at once that it needed a summary of itself.
 *
 * ROLLER's flow is the model, and it matters more here than in the app. This
 * screen is a queue. Someone is standing behind the person filling it in, and
 * a wall of fields reads as "this will take a while" before a single tap
 * happens. Four short screens with a filling progress bar read as almost done
 * from the first one — same fields, same time, completely different feeling.
 *
 * Steps are computed, not hard-coded: a business with minors turned off never
 * sees the "who does this cover" step, so the progress bar stays honest.
 */
import { useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, PenLine, Type, Plus, X } from "lucide-react";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

type StepId = "email" | "details" | "cover" | "sign";

export function KioskWaiverClient({ business, waiver }: { business: Business; waiver: Waiver }) {
  const primary = business.brand_colors?.primary ?? "#2563eb";

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Set when they tap "I don't have an email" — a kiosk cannot hold up the
  // queue over an address, but it should not silently skip asking either.
  const [noEmail, setNoEmail] = useState(false);
  const [who, setWho] = useState<"self" | "minors">("self");
  const [minors, setMinors] = useState<Minor[]>([]);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [sig, setSig] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [signedMinorCount, setSignedMinorCount] = useState(0);
  const topRef = useRef<HTMLDivElement | null>(null);

  const age = ageFrom(dob);
  const cleanMinors = useMemo(
    () => (who === "minors" ? minors.filter(m => m.first.trim() && m.last.trim()) : []),
    [who, minors],
  );

  const stepIds: StepId[] = waiver.minors_enabled
    ? ["email", "details", "cover", "sign"]
    : ["email", "details", "sign"];
  const current = stepIds[Math.min(step, stepIds.length - 1)];
  const lastIndex = stepIds.length - 1;

  const emailOk = noEmail || EMAIL_RE.test(email.trim());
  const detailsOk = name.trim().length >= 2 && !!dob && age !== null && age >= 18 && age <= 120;
  // Every row that has been started has to be finished. A half-typed child is
  // the one thing a parent will not notice they left behind.
  const coverOk = who === "self"
    || (cleanMinors.length > 0 && minors.every(m => m.first.trim() && m.last.trim()));
  const signOk = (mode === "draw" ? !!sig : typed.trim().length >= 2) && agree;

  const stepReady =
    current === "email" ? emailOk
    : current === "details" ? detailsOk
    : current === "cover" ? coverOk
    : signOk;

  /** Why the button is off, named. Exactly one reason, the one on screen. */
  const blockedBecause =
    current === "email" ? "Enter an email address, or tap “I don’t have one”"
    : current === "details"
      ? (name.trim().length < 2 ? "Enter the full name"
        : !dob ? "Enter the date of birth"
        : age === null || age > 120 ? "Check the date of birth"
        : "The person signing has to be 18 or older")
    : current === "cover" ? "Every child needs a first and last name"
    : (mode === "draw" && !sig) ? "Add a signature"
      : (mode === "type" && typed.trim().length < 2) ? "Type the full name as a signature"
      : "Tick the box to agree";

  const stepTitle =
    current === "email" ? "Your email"
    : current === "details" ? "Your details"
    : current === "cover" ? "Who does this cover?"
    : waiver.waiver_title;

  function next() { setErr(null); setStep(s => Math.min(s + 1, lastIndex)); topRef.current?.scrollIntoView(); }
  function back() { setErr(null); setStep(s => Math.max(s - 1, 0)); topRef.current?.scrollIntoView(); }

  async function submit() {
    if (!stepReady || !detailsOk) return;
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
        email: noEmail ? "" : email.trim(),
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
    // Snapshot the count before nextPerson() clears the rows out from under
    // the confirmation screen.
    setSignedMinorCount(cleanMinors.length);
    setDone(name.trim());
  }

  function nextPerson() {
    setStep(0);
    setName(""); setDob(""); setPhone(""); setEmail(""); setNoEmail(false);
    setWho("self"); setMinors([]);
    setSig(null); setTyped(""); setMode("draw"); setAgree(false);
    setErr(null); setDone(null); setSignedMinorCount(0);
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
            Thanks, {done}. Your waiver is signed{signedMinorCount > 0 ? ` for you and ${signedMinorCount} ${signedMinorCount === 1 ? "child" : "children"}` : ""}.
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
          <h1 className="text-2xl font-black text-zinc-900">{business.name}</h1>
          <p className="text-zinc-500 mt-0.5">Please read and sign before you play.</p>
        </div>

        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          {/* Progress. A bar rather than "Step 2 of 4" — on a kiosk the point
              is that it visibly fills while someone waits behind you. */}
          <div className="px-6 pt-6">
            <div className="flex items-center gap-2">
              {stepIds.map((id, i) => (
                <div key={id} className="h-2 flex-1 rounded-full transition-all"
                  style={{ background: i <= step ? primary : "#E4E4E7" }} />
              ))}
            </div>
            <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mt-4">
              Version {waiver.version_no}
            </div>
            <h2 className="text-2xl font-black text-zinc-900 mt-1">{stepTitle}</h2>
          </div>

          <div className="px-6 mt-5 space-y-4">
            {/* ── 1. email ─────────────────────────────────────────────── */}
            {current === "email" && (
              <div>
                <p className="text-[15px] text-zinc-600 -mt-1 mb-4">
                  We&apos;ll send a copy of the signed waiver here so you have it on record.
                </p>
                <label className="block">
                  <span className="text-sm font-bold text-zinc-700">Email address</span>
                  <Input className="h-16 text-xl mt-1.5" type="email" inputMode="email" autoComplete="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (e.target.value) setNoEmail(false); }}
                    placeholder="jane@example.com" />
                </label>
                <button type="button"
                  onClick={() => { setNoEmail(true); setEmail(""); }}
                  className={`mt-4 text-sm font-bold underline ${noEmail ? "text-zinc-900" : "text-zinc-400"}`}>
                  {noEmail ? "No email — we'll skip the copy" : "I don't have one"}
                </button>
              </div>
            )}

            {/* ── 2. details ───────────────────────────────────────────── */}
            {current === "details" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-bold text-zinc-700">Full name *</span>
                  <Input className="h-16 text-xl mt-1.5" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-zinc-700">Date of birth *</span>
                  <Input className="h-16 text-xl mt-1.5" type="date" value={dob} onChange={e => setDob(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-bold text-zinc-700">Phone <span className="font-normal text-zinc-400">(optional)</span></span>
                  <Input className="h-16 text-xl mt-1.5" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(661) 555-0100" />
                </label>
                {dob && age !== null && age < 18 && (
                  <p className="sm:col-span-2 text-[15px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    A parent or guardian has to sign this. Please hand the tablet to them — they can add you as a
                    child on the next screen.
                  </p>
                )}
              </div>
            )}

            {/* ── 3. who it covers ─────────────────────────────────────── */}
            {current === "cover" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => { setWho("self"); }}
                    className={`h-20 rounded-2xl border-2 text-lg font-black transition ${who === "self" ? "text-white" : "bg-white text-zinc-600 border-zinc-200"}`}
                    style={who === "self" ? { background: primary, borderColor: primary } : undefined}>
                    Just me
                  </button>
                  <button type="button"
                    onClick={() => { setWho("minors"); if (minors.length === 0) setMinors([{ first: "", last: "", dob: "" }]); }}
                    className={`h-20 rounded-2xl border-2 text-lg font-black transition ${who === "minors" ? "text-white" : "bg-white text-zinc-600 border-zinc-200"}`}
                    style={who === "minors" ? { background: primary, borderColor: primary } : undefined}>
                    Me and my kids
                  </button>
                </div>

                {who === "minors" && (
                  <div className="space-y-3">
                    {minors.map((m, i) => (
                      <div key={i} className="rounded-xl border p-4 bg-zinc-50">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Child {i + 1}</span>
                          {minors.length > 1 && (
                            <button onClick={() => setMinors(minors.filter((_, j) => j !== i))}
                              aria-label={`Remove child ${i + 1}`}
                              className="h-10 w-10 rounded-lg bg-white border flex items-center justify-center">
                              <X className="h-4 w-4 text-zinc-500" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Input className="h-14 text-lg" placeholder="First name" value={m.first}
                            onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, first: e.target.value } : x))} />
                          <Input className="h-14 text-lg" placeholder="Last name" value={m.last}
                            onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, last: e.target.value } : x))} />
                        </div>
                        <Input className="h-14 text-lg mt-2" type="date" value={m.dob}
                          aria-label={`Child ${i + 1} date of birth`}
                          onChange={e => setMinors(minors.map((x, j) => j === i ? { ...x, dob: e.target.value } : x))} />
                      </div>
                    ))}
                    {minors.length < 12 && (
                      <Button variant="outline" className="w-full h-14 text-base font-bold"
                        onClick={() => setMinors([...minors, { first: "", last: "", dob: "" }])}>
                        <Plus className="h-4 w-4 mr-1.5" /> Add another child
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── 4. the document, then the signature ──────────────────── */}
            {current === "sign" && (
              <>
                <div className="rounded-xl border bg-zinc-50 p-4 max-h-72 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                  {waiver.body_text}
                </div>

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
                  <span className="text-[15px] text-zinc-700">
                    {CONSENT}
                    {cleanMinors.length > 0 && " I am the parent or legal guardian of the children named above and I am signing on their behalf."}
                  </span>
                </label>

                {err && <p className="text-red-600 font-medium">{err}</p>}
              </>
            )}
          </div>

          {/* ── navigation ───────────────────────────────────────────── */}
          <div className="p-6">
            <div className="flex gap-3">
              {step > 0 && (
                <Button variant="outline" onClick={back} disabled={busy} className="h-16 px-7 text-base font-bold">
                  Back
                </Button>
              )}
              {current === "sign" ? (
                <Button onClick={submit} disabled={!stepReady || busy}
                  className="flex-1 h-16 text-lg font-black text-white disabled:opacity-60"
                  style={{ background: primary }}>
                  {busy ? "Signing…" : "Sign and finish"}
                </Button>
              ) : (
                <Button onClick={next} disabled={!stepReady}
                  className="flex-1 h-16 text-lg font-black text-white disabled:opacity-60"
                  style={{ background: primary }}>
                  Continue
                </Button>
              )}
            </div>
            {!stepReady && (
              <p className="text-center text-sm text-zinc-500 mt-3">{blockedBecause}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
