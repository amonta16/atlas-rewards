import io, sys
p = "components/customer/waiver-sign-client.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n"); orig = s

def sub(old, new, label):
    global s
    if old not in s: sys.exit("MISS: " + label)
    if s.count(old) != 1: sys.exit("AMBIGUOUS: " + label)
    s = s.replace(old, new)

# 1 — icons
sub('''import { CheckCircle2, FileSignature, Gift, PenLine, Type, MailCheck, Plus, X } from "lucide-react";''',
    '''import { CheckCircle2, FileSignature, Gift, PenLine, Type, MailCheck, Plus, X, RefreshCw, Send, AlertTriangle } from "lucide-react";''',
    "icons")

# 2 — askGuardian: keep the token, and tell the truth when the mail fails
sub('''    const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; token: string };
    const res = await fetch("/api/waivers/guardian-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: row.token, businessId: business.id }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setErr("We saved the request but couldn't send the email. Ask the front desk to sign you in.");
      return;
    }
    setGuardianSent(guardianEmail.trim());
  }''',
'''    const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; token: string };
    // CP-141: hold the token so the member can resend without minting a
    // second request row.
    setGuardianToken(row.token);
    const ok = await sendGuardianInvite(row.token);
    setBusy(false);
    if (!ok) {
      // The request IS saved and the front desk can still sign them in —
      // say so, rather than implying the whole thing failed.
      setMailFailed(true);
      setGuardianSent(guardianEmail.trim());
      return;
    }
    setMailFailed(false);
    setGuardianSent(guardianEmail.trim());
  }

  /** CP-141: POST the invite. Returns whether the email actually went out. */
  async function sendGuardianInvite(token: string): Promise<boolean> {
    const res = await fetch("/api/waivers/guardian-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, businessId: business.id }),
    }).catch(() => null);
    return !!res && res.ok;
  }

  /** CP-141: resend to the same guardian, same request. */
  async function resendGuardian() {
    if (!guardianToken || resending) return;
    setResending(true); setCheckMsg(null);
    const [ok] = await Promise.all([
      sendGuardianInvite(guardianToken),
      new Promise(r => setTimeout(r, 600)),   // let the spinner be seen
    ]);
    setResending(false);
    setMailFailed(!ok);
    setCheckMsg(ok ? "Sent again — check the inbox and the spam folder." : null);
  }

  /**
   * CP-141: actually ASK whether the parent has signed instead of blindly
   * refreshing. router.refresh() gives no feedback at all, so a member who
   * taps it sees nothing happen and taps it again.
   */
  async function recheckGate() {
    if (checking) return;
    setChecking(true); setCheckMsg(null);
    const supabase = createClient();
    const [res] = await Promise.all([
      supabase.rpc("my_waiver_gate", { p_business_id: business.id }),
      new Promise(r => setTimeout(r, 650)),   // minimum visible spin
    ]);
    const gate = (Array.isArray(res.data) ? res.data[0] : res.data) as { state?: string } | null;
    setChecking(false);
    if (gate?.state === "ok") { router.refresh(); return; }
    setCheckMsg("Not signed yet — we checked just now.");
  }''',
    "askGuardian + helpers")

# 3 — state
sub('''  const [guardianSent, setGuardianSent] = useState<string | null>(awaitingGuardianEmail);''',
'''  const [guardianSent, setGuardianSent] = useState<string | null>(awaitingGuardianEmail);
  // CP-141
  const [guardianToken, setGuardianToken] = useState<string | null>(null);
  const [mailFailed, setMailFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);''',
    "state")

# 4 — the waiting screen
sub('''          <h1 className="text-xl font-black mt-4 text-zinc-900">Sent to your parent or guardian</h1>
          <p className="text-sm text-zinc-500 mt-2">
            We emailed <span className="font-semibold text-zinc-700">{guardianSent}</span> a link to read and sign
            {business.name ? ` ${business.name}'s` : " the"} waiver for you. As soon as they sign, this unlocks.
          </p>
          <p className="text-xs text-zinc-400 mt-3">The link is good for 14 days. You can also just ask the front desk when you get there.</p>
          <Button variant="outline" className="w-full h-11 mt-5" onClick={() => router.refresh()}>
            They&apos;ve signed — check again
          </Button>''',
'''          <h1 className="text-xl font-black mt-4 text-zinc-900">
            {mailFailed ? "We saved your request" : "Sent to your parent or guardian"}
          </h1>

          {/* CP-141: when the email genuinely did not go out, say so. The
              old screen claimed success either way, so a minor could wait
              days for a message that was never sent. */}
          {mailFailed ? (
            <>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-900">
                  We couldn&apos;t get the email out to{" "}
                  <span className="font-semibold">{guardianSent}</span> just now. Your request is saved — try
                  sending again, or ask the front desk to sign you in when you get there.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500 mt-2">
              We emailed <span className="font-semibold text-zinc-700">{guardianSent}</span> a link to read and sign
              {business.name ? ` ${business.name}'s` : " the"} waiver for you. As soon as they sign, this unlocks.
            </p>
          )}

          <p className="text-xs text-zinc-400 mt-3">The link is good for 14 days. You can also just ask the front desk when you get there.</p>

          <Button
            variant="outline"
            className="w-full h-11 mt-5"
            onClick={recheckGate}
            disabled={checking}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "They've signed — check again"}
          </Button>

          {/* CP-141: resending reuses the SAME request row, so the link the
              parent already has keeps working. */}
          {guardianToken && (
            <Button
              variant="ghost"
              className="w-full h-10 mt-2 text-zinc-500"
              onClick={resendGuardian}
              disabled={resending}
            >
              <Send className={`h-3.5 w-3.5 mr-2 ${resending ? "animate-pulse" : ""}`} />
              {resending ? "Sending…" : "Send the email again"}
            </Button>
          )}

          {checkMsg && <p className="text-xs text-zinc-500 mt-2">{checkMsg}</p>}''',
    "waiting screen")

assert s != orig
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n","\r\n") if CRLF else s)
print("patched", p)
