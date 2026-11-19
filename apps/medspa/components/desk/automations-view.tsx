"use client";
/**
 * Desk → App builder → Journey → Automations (CP-249: every clinic manager, was Atlas admins only).
 *
 * The automations Atlas runs for this clinic (the CP-217 suite, installed on every med spa when it's
 * created): what starts each one, when it sends, by push and/or email, and whether it's on. "Preview"
 * shows each message, and every rewards email drawn with the ONE shared template
 * (@atlas/core/email/rewards-email) filled from this clinic's builder: logo, colour, rewards, point
 * costs and reward photos. Nothing here is designed per clinic.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { fillEmailVars, renderRewardsEmail, type RewardsEmailReward } from "@atlas/core/email/rewards-email";
import type { DeskApi, Journey, RewardRow, SuiteMessage } from "@/lib/desk-api";
import { Modal } from "./ui";

const GROUP: [string, string][] = [
  ["rewards", "Rewards"], ["get_in", "New patients"], ["convert", "Turn interest into sales"], ["care", "Care & rebooking"],
  ["come_back", "Bring them back"], ["celebrate", "Celebrate"],
];
const shadow = "shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]";
/** Sample numbers for {{bonus}} from point rules in a preview (a real send uses the clinic's own rules). */
const RULE_SAMPLE: Record<string, number> = { first_visit_bonus: 100, review: 50, referral_referrer: 100 };

export type AutomationsBrand = { name: string; logoUrl: string | null; primary: string; heroUrl: string | null; address: string | null };

export function AutomationsSection({ api, say, brand }: { api: DeskApi; say: (t: string) => void; brand: AutomationsBrand }) {
  const [rows, setRows] = useState<Journey[] | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Journey | null>(null);
  const load = () => {
    api.journeys().then((r) => { setRows(r); setErr(null); }).catch((e) => {
      const m = (e as Error).message || "";
      setErr(/permission|42501|admins only/i.test(m) ? "Your automations show here once Atlas finishes setting them up for your clinic. Nothing is lost in the meantime." : m);
    });
  };
  useEffect(load, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.rewardsList().then(setRewards).catch(() => {}); }, [api]);
  const toggle = async (j: Journey) => {
    try { await api.toggleJourney(j.key, !j.enabled); say(j.enabled ? `${j.name} paused` : `${j.name} is on`); load(); }
    catch (e) { say((e as Error).message); }
  };
  const groups = rows ? GROUP.map(([g, label]) => ({ g, label, items: rows.filter((r) => r.grp === g) })).filter((x) => x.items.length) : [];
  const on = rows?.filter((r) => r.enabled).length ?? 0;

  return (
    <section className={`rounded-[26px] bg-white p-6 ${shadow}`}>
      <div className="mb-5">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Automations</h2>
        <p className="mt-1 max-w-[64ch] text-[14px] text-sub">
          Messages your app sends on its own. Every email uses your logo, colour, rewards and reward photos from App builder, so there&apos;s nothing to design. Edit a reward and the next email shows it.
        </p>
        {rows && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-page px-3 py-1.5 text-[12.5px] text-sub"><span className="h-2 w-2 rounded-full bg-emerald-500" />{on} of {rows.length} on · emails come from {brand.name || "your clinic"}, replies go to your clinic email</p>}
      </div>
      {err && <p className="rounded-[16px] bg-page px-4 py-3 text-[14px] text-sub">{err}</p>}
      {!rows && !err && <div className="h-48 animate-pulse rounded-[20px] bg-page" />}
      <div className="space-y-5">
        {groups.map(({ g, label, items }) => (
          <div key={g}>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line">
              {items.map((j) => {
                const msgs = j.messages ?? [];
                return (
                  <li key={j.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                    <span className={`min-w-[220px] flex-1 ${j.enabled ? "" : "opacity-60"}`}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold">{j.name}</span>
                        {j.channels.map((c) => <span key={c} className="rounded-full bg-page px-2 py-0.5 text-[11.5px] font-semibold text-sub">{c === "email" ? "Email" : c === "push" ? "Push" : c}</span>)}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-sub"><b className="font-medium text-ink">When:</b> {j.trigger_text}</span>
                      <span className="block text-[12.5px] text-faint">{j.timing_text}</span>
                    </span>
                    {j.engine === "workflow" && <span className="hidden text-right text-[12.5px] text-sub md:block"><b className="text-ink">{j.sent_30d}</b> sent<br /><span className="text-faint">last 30 days</span></span>}
                    {msgs.length > 0 && <button type="button" onClick={() => setOpen(j)} className="rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-page">Preview</button>}
                    <span className="flex items-center gap-2">
                      <span className={`w-14 text-right text-[12.5px] font-semibold ${j.enabled ? "text-emerald-600" : "text-faint"}`}>{j.enabled ? "On" : "Paused"}</span>
                      <Switch on={j.enabled} onChange={() => toggle(j)} label={j.name} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {open && <PreviewModal journey={open} brand={brand} rewards={rewards} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[1.4rem]" : "left-0.5"}`} />
    </button>
  );
}

/* ───────────── preview ───────────── */

/** A believable patient for this journey, from the clinic's own rewards. */
export function sampleFor(key: string, list: RewardsEmailReward[]) {
  const r = [...list].sort((a, b) => a.pointCost - b.pointCost);
  const first = r[0], second = r[1] ?? r[0];
  const mid = first && second ? Math.round(first.pointCost + (second.pointCost - first.pointCost) * 0.45) : 120;
  let points = mid, featured: RewardsEmailReward | undefined = first;
  if (key === "ms.reward_ready" && first) { points = first.pointCost + Math.max(5, Math.round(first.pointCost * 0.1)); featured = [...r].reverse().find((x) => x.pointCost <= points) ?? first; }
  else if (key === "ms.almost_there" && second) { points = Math.ceil(second.pointCost * 0.8); featured = r.find((x) => x.pointCost > points) ?? second; }
  else if (key === "ms.reward_expiring" && first) { points = Math.round(first.pointCost * 0.3); featured = first; }
  else if (key === "ms.welcome" && first) { points = Math.round(first.pointCost * 0.4); featured = undefined; }
  else featured = r.find((x) => x.pointCost > points);
  const next = r.find((x) => x.pointCost > points);
  return { points, featured, remaining: next ? next.pointCost - points : 0 };
}

function absolute(u: string | null) {
  if (!u) return null;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  return typeof window === "undefined" ? u : new URL(u, window.location.origin).toString();
}

function PreviewModal({ journey, brand, rewards, onClose }: { journey: Journey; brand: AutomationsBrand; rewards: RewardRow[]; onClose: () => void }) {
  const msgs = journey.messages ?? [];
  const [i, setI] = useState(() => Math.max(0, msgs.findIndex((m) => m.channel === "email" && m.template === "rewards")));
  const [phone, setPhone] = useState(false);
  const list: RewardsEmailReward[] = useMemo(() => rewards.filter((r) => r.is_active && r.show_in_store && r.point_cost > 0)
    .map((r) => ({ id: r.id, name: r.name, pointCost: r.point_cost, imageUrl: absolute(r.image_url) })), [rewards]);
  const s = useMemo(() => sampleFor(journey.key, list), [journey.key, list]);
  const due = new Date(Date.now() + 3 * 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const m = msgs[i] as SuiteMessage | undefined;
  const vars = {
    first_name: "Jane", business: brand.name, points: s.points.toLocaleString("en-US"), points_remaining: s.remaining.toLocaleString("en-US"),
    offer_name: s.featured?.name ?? list[0]?.name ?? "a complimentary facial", due_date: due, days_since_last_visit: "92",
    bonus: String(m?.points ?? (m?.points_rule ? RULE_SAMPLE[m.points_rule] ?? 100 : 200)), friend_bonus: "100",
    item: "HydraFacial, 3 sessions", treatment: "HydraFacial", price: "$750", installment: "$187.50", appt_time: "Tuesday at 2:30 pm", link: "/app",
    member_value: "member pricing on every treatment, plus members-only perks",
  };
  const f = (t: string | null | undefined) => fillEmailVars(t, vars);
  const html = useMemo(() => {
    if (!m || m.channel !== "email" || m.template !== "rewards") return null;
    return renderRewardsEmail({
      brand: { businessName: brand.name, logoUrl: absolute(brand.logoUrl), primary: brand.primary, heroUrl: absolute(brand.heroUrl), address: brand.address },
      subject: f(m.subject), preheader: f(m.preheader), firstName: "Jane", points: s.points,
      headline: f(m.heading) || f(m.subject), body: f(m.body), ctaLabel: f(m.cta_label) || null, ctaUrl: m.cta_label ? "#" : null,
      rewardsUrl: "#", rewards: list, featuredRewardId: s.featured?.id ?? null, footnote: f(m.footnote) || null, unsubscribeUrl: "#",
    }).html;
  }, [m, brand, list, s]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={journey.name} onClose={onClose} wide>
      <p className="-mt-2 mb-4 text-[13.5px] text-sub">{journey.trigger_text} · {journey.timing_text}</p>
      {msgs.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
          {msgs.map((x, k) => (
            <button key={x.node_id} type="button" onClick={() => setI(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${k === i ? "bg-ink text-white" : "bg-page text-sub"}`}>
              {x.channel === "email" ? "Email" : "Push"} · {x.when_text ?? x.label}
            </button>
          ))}
        </div>
      )}
      {m && m.channel === "push" && (
        <div className="rounded-[22px] bg-page p-5">
          <div className="mx-auto max-w-[360px] rounded-[18px] bg-white/90 p-3.5 shadow-card">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">{brand.name} · now</p>
            <p className="mt-1 text-[14.5px] font-semibold">{f(m.title)}</p>
            <p className="text-[13.5px] text-sub">{f(m.body)}</p>
          </div>
          <p className="mt-3 text-center text-[12.5px] text-faint">Phone notification{m.when_text ? ` · ${m.when_text}` : ""}</p>
        </div>
      )}
      {m && m.channel === "email" && (
        <>
          <div className="mb-3 rounded-[16px] bg-page px-4 py-3 text-[13px]">
            <p><span className="text-faint">From</span> <b>{brand.name}</b> <span className="text-faint">&lt;hello@atlas-engine.app&gt;</span></p>
            <p><span className="text-faint">Subject</span> <b>{f(m.subject)}</b></p>
            {m.preheader && <p className="text-sub">{f(m.preheader)}</p>}
          </div>
          {html ? (
            <>
              <div className="mb-2 flex justify-end gap-1 text-[12px] font-semibold">
                {[["Desktop", false], ["Phone", true]].map(([l, v]) => (
                  <button key={String(l)} type="button" onClick={() => setPhone(v as boolean)} className={`rounded-full px-3 py-1 ${phone === v ? "bg-ink text-white" : "bg-page text-sub"}`}>{l as string}</button>
                ))}
              </div>
              <div className="overflow-hidden rounded-[18px] border border-line bg-white">
                <EmailFrame title={`${journey.name} email preview`} html={html} width={phone ? 375 : "100%"} />
              </div>
              <p className="mt-2 text-[12px] text-faint">Sample patient &ldquo;Jane&rdquo; with {s.points.toLocaleString("en-US")} points. Real emails use each patient&apos;s own name and balance.</p>
            </>
          ) : (
            <div className="rounded-[18px] border border-line p-5">
              {m.heading && <p className="text-[18px] font-semibold">{f(m.heading)}</p>}
              {f(m.body).split(/\n{2,}/).map((p, k) => <p key={k} className="mt-2 text-[14px] text-sub">{p}</p>)}
              {m.cta_label && <span className="mt-4 inline-block rounded-full bg-brand px-4 py-2 text-[13.5px] font-semibold text-white">{f(m.cta_label)}</span>}
              <p className="mt-4 text-[12px] text-faint">Short branded note (your logo and colour).</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** The email in an isolated frame (no scripts), grown to its full height so the modal scrolls, not the frame. */
function EmailFrame({ title, html, width }: { title: string; html: string; width: number | string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const fit = () => { const d = f.contentDocument; if (d?.body) f.style.height = `${d.documentElement.scrollHeight + 2}px`; };
    f.addEventListener("load", fit);
    const imgs = () => f.contentDocument?.querySelectorAll("img").forEach((im) => im.addEventListener("load", fit));
    const t = window.setTimeout(() => { fit(); imgs(); }, 60);
    fit();
    return () => { f.removeEventListener("load", fit); window.clearTimeout(t); };
  }, [html, width]);
  return <iframe ref={ref} title={title} srcDoc={html} sandbox="allow-same-origin" scrolling="no" className="mx-auto block border-0" style={{ width, height: 1200 }} />;
}
