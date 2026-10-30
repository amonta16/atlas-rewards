"use client";
/**
 * ReportEmailSettings — CP-221 · "Who gets this email" on Insights → Monthly reports
 *
 * The monthly report is emailed on the 1st. By default it goes to every
 * manager login on the business. Adding addresses here replaces that with an
 * exact list (businesses.report_recipients) — e.g. just the owner/GM, even if
 * she has no login. "Email me a test" sends the report on screen to your own
 * login email (or to anyone on the list) without touching the real send.
 */
import { useEffect, useState } from "react";
import { Mail, Plus, X, Loader2, Send, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { Business } from "@/lib/types/database";

type Rec = { custom: string[] | null; effective: { email: string; name: string }[]; managers: string[]; me: string | null };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function ReportEmailSettings({ business, month, accent }: { business: Business; month: string | null; accent: string }) {
  const { toast } = useToast();
  const [rec, setRec] = useState<Rec | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState<string>("");
  const [sending, setSending] = useState(false);

  const load = () => createClient().rpc("get_report_recipients", { p_business_id: business.id }).then(({ data, error }) => {
    if (!error && data) { setRec(data as Rec); }
  });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [business.id]);
  useEffect(() => { if (rec?.me && !testTo) setTestTo(rec.me); }, [rec, testTo]);

  if (!rec) return null;   // SQL not applied yet / not a manager → nothing to show

  const custom = rec.custom ?? [];
  const usingCustom = custom.length > 0;

  async function save(list: string[]) {
    setSaving(true);
    const { error } = await createClient().rpc("set_report_recipients", { p_business_id: business.id, p_emails: list });
    setSaving(false);
    if (error) { toast.error("Couldn't save — " + error.message); return; }
    await load();
  }
  function add() {
    const e = draft.trim().toLowerCase();
    if (!EMAIL.test(e)) { toast.error("That doesn't look like an email address."); return; }
    // First custom address: start from nobody (the list REPLACES the manager default).
    save(Array.from(new Set([...custom, e])));
    setDraft("");
  }
  async function sendTest() {
    setSending(true);
    const r = await fetch("/api/reports/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: business.id, month, to: testTo || null }),
    }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setSending(false);
    if (r?.ok) toast.success(`Test report sent to ${r.to}`);
    else toast.error(r?.error ?? "Couldn't send the test.");
  }

  const testOptions = Array.from(new Set([rec.me, ...rec.effective.map((x) => x.email)].filter(Boolean) as string[]));

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left">
        <Mail className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-zinc-900">Who gets this email</div>
          <div className="text-[12px] text-zinc-500 truncate">
            {rec.effective.length
              ? <>Emailed on the 1st to {rec.effective.map((x) => x.email).join(", ")}</>
              : "Nobody yet — add an address below"}
          </div>
        </div>
        <span className="text-[12px] font-semibold" style={{ color: accent }}>{open ? "Done" : "Edit · Send test"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-5 py-4 space-y-5">
          <section>
            <div className="text-[12px] font-bold text-zinc-900">Report emails</div>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              {usingCustom
                ? "The report goes only to these addresses. Remove them all to go back to every manager login."
                : "Right now it goes to every manager login below. Add an address to send it only to the people you list instead."}
            </p>
            {usingCustom ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {custom.map((e) => (
                  <li key={e} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 pl-3 pr-1 h-8 text-[12.5px] text-zinc-800">
                    {e}
                    <button type="button" aria-label={`Remove ${e}`} disabled={saving} onClick={() => save(custom.filter((x) => x !== e))}
                      className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-zinc-200"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {rec.managers.map((e) => (
                  <li key={e} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 h-8 text-[12.5px] text-zinc-600"><Users className="h-3.5 w-3.5" />{e}</li>
                ))}
                {rec.managers.length === 0 && <li className="text-[12px] text-zinc-400">No manager logins on this business.</li>}
              </ul>
            )}
            <form className="mt-3 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); add(); }}>
              <input type="email" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="manager@business.com"
                className="h-10 flex-1 min-w-0 rounded-xl border border-zinc-300 px-3 text-[13.5px] outline-none focus:border-zinc-500" />
              <button type="submit" disabled={saving || !draft.trim()}
                className="h-10 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                style={{ background: accent }}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
              </button>
            </form>
          </section>

          <section>
            <div className="text-[12px] font-bold text-zinc-900">Send a test</div>
            <p className="text-[12px] text-zinc-500 mt-0.5">Sends the report on screen, marked [Test]. The real email on the 1st isn&apos;t affected.</p>
            <div className="mt-2 flex gap-2 flex-wrap">
              <select value={testTo} onChange={(e) => setTestTo(e.target.value)}
                className="h-10 flex-1 min-w-[200px] rounded-xl border border-zinc-300 px-3 text-[13.5px] bg-white">
                {testOptions.map((e) => <option key={e} value={e}>{e === rec.me ? `${e} (me)` : e}</option>)}
              </select>
              <button type="button" onClick={sendTest} disabled={sending || !testTo}
                className="h-10 px-4 rounded-xl border-2 text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                style={{ borderColor: accent, color: accent }}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
