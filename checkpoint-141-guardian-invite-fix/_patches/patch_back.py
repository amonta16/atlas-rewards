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

sub('''import { CheckCircle2, FileSignature, Gift, PenLine, Type, MailCheck, Plus, X, RefreshCw, Send, AlertTriangle } from "lucide-react";''',
    '''import { CheckCircle2, FileSignature, Gift, PenLine, Type, MailCheck, Plus, X, RefreshCw, Send, AlertTriangle, ArrowLeft } from "lucide-react";''',
    "icon")

sub('''  const [checkMsg, setCheckMsg] = useState<string | null>(null);''',
    '''  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);   // CP-141.1''',
    "state")

sub('''  /**
   * CP-141: actually ASK whether the parent has signed instead of blindly''',
'''  /**
   * CP-141.1: back out of the guardian path.
   *
   * CP-137's gate is a deliberate dead end — pending request means the app
   * renders the waiting screen INSTEAD of the app, with nothing else to tap.
   * Right for a real minor, a trap for an adult who hit the wrong button.
   * This cancels the request server-side (the gate then reads
   * needs_signature again) and drops them back on the signing form.
   *
   * It is not a bypass: the form still refuses an under-18 date of birth,
   * in the client AND in sign_waiver_v2().
   */
  async function cancelGuardian() {
    if (cancelling) return;
    const ok = window.confirm(
      "Go back and sign this yourself?\\n\\n" +
      "The link we emailed will stop working. You can always ask a parent again.",
    );
    if (!ok) return;
    setCancelling(true); setCheckMsg(null); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_guardian_request", {
      p_business_id: business.id,
    });
    setCancelling(false);
    if (error) { setErr(error.message); return; }
    // Clear the local screen AND re-read the gate, which now says
    // needs_signature, so the signing form comes back in gate mode too.
    setGuardianSent(null);
    setGuardianToken(null);
    setMailFailed(false);
    router.refresh();
  }

  /**
   * CP-141: actually ASK whether the parent has signed instead of blindly''',
    "cancelGuardian")

sub('''          {checkMsg && <p className="text-xs text-zinc-500 mt-2">{checkMsg}</p>}''',
'''          {checkMsg && <p className="text-xs text-zinc-500 mt-2">{checkMsg}</p>}
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

          {/* CP-141.1: the way out. Without this an adult who mis-tapped the
              guardian button is locked out of the app entirely, with no
              screen to navigate to and no button to press. */}
          <button
            onClick={cancelGuardian}
            disabled={cancelling}
            className="mt-4 text-xs text-zinc-500 underline underline-offset-2 disabled:opacity-50 inline-flex items-center gap-1 mx-auto"
          >
            <ArrowLeft className="h-3 w-3" />
            {cancelling ? "Going back…" : "Wrong button? Go back and sign it myself"}
          </button>''',
    "back button")

assert s != orig
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n","\r\n") if CRLF else s)
print("patched", p)
