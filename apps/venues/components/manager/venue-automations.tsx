"use client";
/**
 * Desk → Campaigns → Automations (CP-261) · the venue version of the med spa desk's Automations list.
 *
 * The email journeys Atlas runs for an entertainment venue (Flippo's): what starts each one, when each
 * email goes out, on/off, emails sent in the last 30 days, and "Preview": every email drawn with the arcade
 * layout (lib/automations/arcade-email.ts) from this venue's logo, colours, prize-counter photos and point
 * costs, on desktop or phone width. "Send me a test" mails it to the signed-in manager with working links.
 *
 * Reads wf_suite() / writes wf_suite_toggle() (managers + Atlas admins). Before the CP-261 SQL is applied
 * the list comes from the bundled catalog, read-only, so the desk never shows an empty screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, Send, Eye, X, Monitor, Smartphone, Sparkles, Gift, Users, PartyPopper, RotateCcw, Check, Loader2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";
import type { ArcadeEmailPrize } from "@/lib/automations/arcade-email";
import { buildVenueEmail, venueScenario, VENUE_CATALOG, type VenueJourney, type VenueMessage } from "@/lib/automations/venue-email-build";

const GROUPS: { id: string; label: string; blurb: string; icon: React.ReactNode }[] = [
  { id: "get_in",      label: "New players",          blurb: "Turn sign-ups into first visits",          icon: <Sparkles className="h-4 w-4" /> },
  { id: "rewards",     label: "Prizes & points",      blurb: "Keep the prize counter top of mind",       icon: <Gift className="h-4 w-4" /> },
  { id: "after_visit", label: "After the visit",      blurb: "Reviews and referrals while it's fresh",   icon: <Users className="h-4 w-4" /> },
  { id: "come_back",   label: "Bring them back",      blurb: "Catch regulars before they drift",         icon: <RotateCcw className="h-4 w-4" /> },
  { id: "celebrate",   label: "Parties & birthdays",  blurb: "Your biggest tickets",                     icon: <PartyPopper className="h-4 w-4" /> },
];

type Status = { sending: boolean; provider: boolean; to: string | null } | null;

export function VenueAutomations({ business }: { business: Business }) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary || primary;
  const [rows, setRows] = useState<VenueJourney[] | null>(null);
  const [live, setLive] = useState(false);          // the CP-261 SQL is applied: switches work
  const [note, setNote] = useState<string | null>(null);
  const [prizes, setPrizes] = useState<ArcadeEmailPrize[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [open, setOpen] = useState<VenueJourney | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((c) => (c === t ? null : c)), 3200); };

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("wf_suite", { p_business_id: business.id });
    const list = (Array.isArray(data) ? data : []) as VenueJourney[];
    if (!error && list.length && list.every((r) => r.key.startsWith("fe."))) {
      setRows(list); setLive(true); setNote(null);
    } else {
      setRows(VENUE_CATALOG.map((j) => ({ ...j, enabled: false, sent_30d: 0 })));
      setLive(false);
      setNote(error && /permission|42501|managers only/i.test(error.message)
        ? "Only managers can change automations. You can still preview every email."
        : "Atlas is finishing the setup for your venue. You can preview every email now; the switches turn on as soon as setup is done.");
    }
  }, [business.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    createClient().from("rewards").select("id, name, point_cost, image_url").eq("business_id", business.id)
      .eq("is_active", true).eq("show_in_store", true).is("archived_at", null).order("point_cost", { ascending: true })
      .then(({ data }) => setPrizes(((data ?? []) as { id: string; name: string; point_cost: number; image_url: string | null }[])
        .map((r) => ({ id: r.id, name: r.name, pointCost: r.point_cost, imageUrl: r.image_url }))));
    fetch(`/api/automations/venue-email?business_id=${business.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setStatus(j)).catch(() => setStatus(null));
  }, [business.id]);

  async function toggle(j: VenueJourney) {
    if (!live) { say("Setup isn't finished yet, nothing to switch on."); return; }
    setBusy(j.key);
    const { error } = await createClient().rpc("wf_suite_toggle", { p_business_id: business.id, p_key: j.key, p_enabled: !j.enabled });
    setBusy(null);
    if (error) { say(error.message); return; }
    say(j.enabled ? `${j.name} paused` : `${j.name} is on`);
    load();
  }

  const on = rows?.filter((r) => r.enabled).length ?? 0;
  const emails = rows?.reduce((n, r) => n + r.messages.filter((m) => m.channel === "email").length, 0) ?? 0;
  const sent = rows?.reduce((n, r) => n + (r.sent_30d ?? 0), 0) ?? 0;
  const statusPill = !status ? null
    : !status.provider ? { tone: "bg-rose-100 text-rose-800", dot: "bg-rose-500", text: "Email isn't connected yet" }
    : status.sending ? { tone: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", text: "Sending is live" }
    : { tone: "bg-amber-100 text-amber-900", dot: "bg-amber-500", text: "Test mode: emails are held until Atlas turns sending on" };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl p-5 text-white relative overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}>
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"><Mail className="h-6 w-6" /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold leading-tight">Email automations</h2>
            <p className="text-sm text-white/85 mt-1 max-w-2xl">
              Emails your app sends on its own, at the right moment for each player. Every one uses your logo, colours and prize-counter photos,
              and shows each player their own points, so there&apos;s nothing to design. Change a prize and the next email shows it.
            </p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2 max-w-lg">
          {[[`${on} of ${rows?.length ?? 10}`, "journeys on"], [String(emails), "emails ready"], [sent.toLocaleString("en-US"), "sent · 30 days"]].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-white/15 px-3 py-2.5">
              <div className="text-lg font-black leading-none">{v}</div>
              <div className="text-[11px] text-white/80 mt-1">{l}</div>
            </div>
          ))}
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          {statusPill && <span className={cn("inline-flex items-center gap-2 rounded-full px-3 h-8 font-bold", statusPill.tone)}><span className={cn("h-2 w-2 rounded-full", statusPill.dot)} />{statusPill.text}</span>}
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 h-8 text-white/90">From {business.name.trim()} &lt;hello@atlas-engine.app&gt;</span>
        </div>
      </div>

      {note && <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900"><Info className="h-4 w-4 mt-0.5 shrink-0" />{note}</div>}
      {!rows && <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />}

      {rows && GROUPS.map((g) => {
        const items = rows.filter((r) => r.grp === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} className="rounded-3xl bg-white border shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-zinc-50/70">
              <span className="h-8 w-8 rounded-xl grid place-items-center text-white shrink-0" style={{ background: primary }}>{g.icon}</span>
              <div className="leading-tight">
                <div className="text-[13px] font-black uppercase tracking-wider text-zinc-800">{g.label}</div>
                <div className="text-[11.5px] text-zinc-500">{g.blurb}</div>
              </div>
            </div>
            <ul className="divide-y">
              {items.map((j) => {
                const mails = j.messages.filter((m) => m.channel === "email");
                return (
                  <li key={j.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                    <div className={cn("min-w-[220px] flex-1", !j.enabled && "opacity-70")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-bold text-zinc-900">{j.name}</span>
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${primary}14`, color: primary }}>
                          {mails.length === 1 ? "1 email" : `${mails.length} emails`}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[13px] text-zinc-600"><b className="font-semibold text-zinc-800">When:</b> {j.trigger_text}</div>
                      <div className="text-[12px] text-zinc-400">{j.timing_text}{j.reward_text ? ` · ${j.reward_text}` : ""}</div>
                    </div>
                    {live && <div className="hidden md:block text-right text-[12px] text-zinc-500 w-20"><b className="text-zinc-900 text-[14px]">{j.sent_30d ?? 0}</b> sent<br /><span className="text-zinc-400">30 days</span></div>}
                    <button type="button" onClick={() => setOpen(j)} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 h-9 text-[13px] font-bold text-zinc-800 hover:bg-zinc-50">
                      <Eye className="h-4 w-4" /> Preview
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={cn("w-14 text-right text-[12.5px] font-bold", j.enabled ? "text-emerald-600" : "text-zinc-400")}>{j.enabled ? "On" : "Paused"}</span>
                      <button type="button" role="switch" aria-checked={!!j.enabled} aria-label={`${j.name}: ${j.enabled ? "on" : "paused"}`} disabled={busy === j.key || !live}
                        onClick={() => toggle(j)}
                        className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", j.enabled ? "" : "bg-zinc-300")}
                        style={j.enabled ? { background: primary } : undefined}>
                        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all grid place-items-center", j.enabled ? "left-[1.4rem]" : "left-0.5")}>
                          {busy === j.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-[12px] text-zinc-400 px-1">
        Never more than 3 messages a player a week (push included), only between 10 am and 8 pm your time, and every email has a one-tap unsubscribe.
        Your existing push reminders (we miss you, birthday gift, expiring gifts) keep running as before.
      </p>

      {open && <PreviewModal business={business} journey={open} prizes={prizes} status={status} onClose={() => setOpen(null)} say={say} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] rounded-full bg-zinc-900 text-white px-4 py-2.5 text-sm font-semibold shadow-xl">{toast}</div>}
    </div>
  );
}

function absolute(u: string | null) {
  if (!u) return null;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  return typeof window === "undefined" ? u : new URL(u, window.location.origin).toString();
}

function PreviewModal({ business, journey, prizes, status, onClose, say }: {
  business: Business; journey: VenueJourney; prizes: ArcadeEmailPrize[]; status: Status; onClose: () => void; say: (t: string) => void;
}) {
  const mails = journey.messages.filter((m) => m.channel === "email");
  const [i, setI] = useState(0);
  const [phone, setPhone] = useState(false);
  const [sending, setSending] = useState(false);
  const m = mails[i] as VenueMessage | undefined;
  const list = useMemo(() => prizes.map((p) => ({ ...p, imageUrl: absolute(p.imageUrl) })), [prizes]);
  const built = useMemo(() => !m ? null : buildVenueEmail({
    journeyKey: journey.key, msg: m, prizes: list, firstName: "Alex", pointRules: business.point_rules as unknown as Record<string, number>,
    brand: { businessName: business.name.trim(), logoUrl: absolute(business.logo_url), primary: business.brand_colors.primary,
             secondary: business.brand_colors.secondary, heroUrl: absolute(business.hero_image_url ?? null),
             address: business.contact_info?.address ?? null, phone: business.contact_info?.phone ?? null },
    // links in the preview open the real app screens in a new tab
    base: (path) => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString()),
    unsubscribeUrl: "#",
  }), [m, journey.key, list, business]);
  const scenario = useMemo(() => venueScenario(journey.key, list), [journey.key, list]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function sendTest() {
    if (!m) return;
    setSending(true);
    const r = await fetch("/api/automations/venue-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: business.id, key: journey.key, node_id: m.node_id }),
    }).catch(() => null);
    setSending(false);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) say(`Test sent to ${j.to}. Check your inbox (and spam) in a minute.`);
    else say(j.error || "Couldn't send the test. Try again.");
  }

  return (
    <div className="fixed inset-0 z-[60] bg-zinc-950/55 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${journey.name} preview`}>
        <div className="flex items-start gap-3 p-5 border-b">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-zinc-900">{journey.name}</h3>
            <p className="text-[13px] text-zinc-500 mt-0.5">{journey.trigger_text} · {journey.timing_text}</p>
            <p className="text-[13px] text-zinc-600 mt-2 max-w-[62ch]">{journey.why}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full hover:bg-zinc-100 grid place-items-center shrink-0" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {mails.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {mails.map((x, k) => (
                <button key={x.node_id} type="button" onClick={() => setI(k)}
                  className={cn("shrink-0 rounded-full px-3 h-8 text-[12.5px] font-bold", k === i ? "text-white" : "bg-zinc-100 text-zinc-600")}
                  style={k === i ? { background: business.brand_colors.primary } : undefined}>
                  Email {k + 1} · {x.when_text ?? x.label}
                </button>
              ))}
            </div>
          )}
          {built && m && (
            <>
              <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-[13px] space-y-0.5">
                <p><span className="text-zinc-400">From</span> <b>{business.name.trim()}</b> <span className="text-zinc-400">&lt;hello@atlas-engine.app&gt;</span></p>
                <p><span className="text-zinc-400">Subject</span> <b>{built.subject}</b></p>
                {built.preheader && <p className="text-zinc-500">{built.preheader}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-full bg-zinc-100 p-1 text-[12px] font-bold">
                  {([["Desktop", false, <Monitor key="d" className="h-3.5 w-3.5" />], ["Phone", true, <Smartphone key="p" className="h-3.5 w-3.5" />]] as const).map(([l, v, icon]) => (
                    <button key={l} type="button" onClick={() => setPhone(v)} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 h-7", phone === v ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>{icon}{l}</button>
                  ))}
                </div>
                <button type="button" onClick={sendTest} disabled={sending || status?.provider === false}
                  className="inline-flex items-center gap-2 rounded-full px-4 h-9 text-[13px] font-bold text-white shadow disabled:opacity-50"
                  style={{ background: business.brand_colors.primary }}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send me a test{status?.to ? ` (${status.to})` : ""}
                </button>
              </div>
              <div className="rounded-2xl border bg-zinc-100 overflow-hidden">
                <EmailFrame title={`${journey.name} email preview`} html={built.html} width={phone ? 375 : "100%"} />
              </div>
              <p className="text-[12px] text-zinc-400 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" /> Sample player &ldquo;Alex&rdquo; with {scenario.points.toLocaleString("en-US")} points. Real emails use each player&apos;s own name, points and prizes. Buttons here open your app in a new tab.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The email in an isolated frame, grown to its full height; links open in a new tab. */
function EmailFrame({ title, html, width }: { title: string; html: string; width: number | string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const fit = () => { const d = f.contentDocument; if (d?.body) f.style.height = `${d.documentElement.scrollHeight + 2}px`; };
    f.addEventListener("load", fit);
    const t = window.setTimeout(() => { fit(); f.contentDocument?.querySelectorAll("img").forEach((im) => im.addEventListener("load", fit)); }, 80);
    fit();
    return () => { f.removeEventListener("load", fit); window.clearTimeout(t); };
  }, [html, width]);
  return <iframe ref={ref} title={title} srcDoc={html} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" scrolling="no" className="mx-auto block border-0 bg-white" style={{ width, height: 1400 }} />;
}
