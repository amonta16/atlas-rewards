"use client";
/**
 * components/medspa-builder/medspa-studio.tsx — CP-185 · Med spa builder tabs
 *
 * Five editors that show up in the BrandEditor only when the business runs
 * the "medspa" layout. They all edit ONE object (businesses.medspa_config)
 * through `onChange`, and the builder's Save button persists it, so the
 * owner's mental model stays "edit, then Save" like every other tab.
 *
 * Each editor says plainly what is live and what is a placeholder:
 *   Treatments     live  — menu + recall windows + per-treatment aftercare
 *   Recall timing  stored, NOT sending yet (banner says so)
 *   Credits        rules stored; balance shown in app is an estimate
 *   Providers      live  — shown in app; booking does not assign yet
 *   Gallery        live  — public before/after strip (consent gate)
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Sparkles, Clock, BellRing, Wallet, Users, Images, ShieldCheck, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/agency/image-uploader";
import type { Business } from "@/lib/types/database";
import {
  MEDSPA_CATEGORIES, MEDSPA_STARTER_TREATMENTS, RECALL_TOKENS, cents, fillTemplate, newId, weeksLabel,
  type MedspaConfig, type MedspaGalleryItem, type MedspaProvider, type MedspaTreatment,
} from "@/lib/medspa";

type EditorProps = { business: Business; cfg: MedspaConfig; onChange: (next: MedspaConfig) => void };

/* ───────────────────────── shared bits ───────────────────────── */

function Card({ title, subtitle, icon, children, aside }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon && <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f0ee] text-[#2C6E7F]">{icon}</span>}
          <div>
            <h3 className="font-semibold">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Honest status chip. live = works end to end; stored = saved and shown, engine pending. */
function Status({ kind, children }: { kind: "live" | "stored" | "estimate"; children: React.ReactNode }) {
  const tone = kind === "live" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : kind === "stored" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-sky-50 text-sky-800 ring-sky-200";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", tone)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>;
}

function Money({ value, onChange, placeholder = "—" }: { value: number | null; onChange: (c: number | null) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
      <Input className="pl-7" inputMode="decimal" placeholder={placeholder} value={value == null ? "" : (value / 100).toString()}
        onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); onChange(v === "" ? null : Math.round(parseFloat(v) * 100) || 0); }} />
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", on ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>{children}</button>
  );
}

/* ───────────────────────── 1. treatments + recall ───────────────────────── */

export function TreatmentsEditor({ business, cfg, onChange }: EditorProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = cfg.treatments;
  const set = (treatments: MedspaTreatment[]) => onChange({ ...cfg, treatments });
  const upd = (id: string, p: Partial<MedspaTreatment>) => set(list.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const add = () => { const t: MedspaTreatment = { id: newId("tr"), name: "", category: "Injectables", recall_weeks: 12, duration_minutes: 30, price_cents: null, member_price_cents: null, description: "", aftercare: [], image_url: null, is_active: true }; set([...list, t]); setOpenId(t.id); };
  const loadStarter = () => set([...list, ...MEDSPA_STARTER_TREATMENTS.filter((s) => !list.some((t) => t.name.toLowerCase() === s.name.toLowerCase())).map((s) => ({ ...s, id: newId("tr") }))]);
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; set(n); };
  const byCat = useMemo(() => { const m = new Map<string, number>(); list.forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + 1)); return m; }, [list]);

  return (
    <div className="space-y-6">
      <Card icon={<Sparkles className="h-4 w-4" />} title="Treatment menu"
        subtitle="What you offer, how long results last, and what patients see in the app. The recall window is what tells Atlas when a patient is due."
        aside={<Status kind="live">Live in the patient app</Status>}>
        {list.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center">
            <p className="text-sm font-medium">No treatments yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Load a typical med spa menu with recall windows filled in, then edit prices and names to match your practice.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={loadStarter} className="bg-zinc-900 text-white hover:bg-zinc-800"><Sparkles className="mr-1.5 h-4 w-4" />Load starter menu</Button>
              <Button variant="outline" onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add one</Button>
            </div>
          </div>
        )}
        {list.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {[...byCat.entries()].map(([c, n]) => <span key={c} className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">{c} · {n}</span>)}
              <span className="ml-auto">{list.filter((t) => t.recall_weeks).length} of {list.length} have a recall window</span>
            </div>
            <ul className="divide-y rounded-2xl border">
              {list.map((t, i) => {
                const open = openId === t.id;
                return (
                  <li key={t.id} className={cn("transition-colors", !t.is_active && "opacity-60")}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex flex-col text-zinc-300">
                        <button type="button" onClick={() => move(i, -1)} className="hover:text-zinc-600" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => move(i, 1)} className="hover:text-zinc-600" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                      </div>
                      {t.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={t.image_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#e9efec] to-[#d6e2de] text-[11px] font-bold text-[#2C6E7F]">{(t.name || "?").slice(0, 2).toUpperCase()}</span>
                      )}
                      <button type="button" onClick={() => setOpenId(open ? null : t.id)} className="min-w-0 flex-1 text-left">
                        <div className="truncate font-semibold">{t.name || <span className="text-zinc-400">Untitled treatment</span>}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>{t.category}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{t.duration_minutes} min</span>
                          <span className={cn("inline-flex items-center gap-1", t.recall_weeks ? "text-[#2C6E7F] font-medium" : "")}><BellRing className="h-3 w-3" />{weeksLabel(t.recall_weeks)}</span>
                          {t.price_cents != null && <span>{cents(t.price_cents)}{t.member_price_cents != null && <> · members {cents(t.member_price_cents)}</>}</span>}
                        </div>
                      </button>
                      <Switch checked={t.is_active} onCheckedChange={(v) => upd(t.id, { is_active: v })} aria-label="Shown in app" />
                      <button type="button" onClick={() => setOpenId(open ? null : t.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label={open ? "Collapse" : "Edit"}>
                        {open ? <ChevronUp className="h-4 w-4" /> : <GripVertical className="h-4 w-4 rotate-90" />}
                      </button>
                    </div>
                    {open && (
                      <div className="grid gap-4 border-t bg-zinc-50/70 px-4 py-5 md:grid-cols-[1fr_220px]">
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label>Name</Label><Input value={t.name} onChange={(e) => upd(t.id, { name: e.target.value })} placeholder="Neurotoxin" /></div>
                            <div className="space-y-1.5"><Label>Group</Label>
                              <div className="flex flex-wrap gap-1.5">{MEDSPA_CATEGORIES.map((c) => <Pill key={c} on={t.category === c} onClick={() => upd(t.id, { category: c })}>{c}</Pill>)}</div>
                            </div>
                          </div>
                          <div className="space-y-1.5"><Label>One line for patients</Label><Input value={t.description} onChange={(e) => upd(t.id, { description: e.target.value })} placeholder="Smooths lines in the forehead, between the brows and around the eyes." /></div>
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div className="space-y-1.5"><Label>Length</Label>
                              <div className="relative"><Input inputMode="numeric" value={t.duration_minutes} onChange={(e) => upd(t.id, { duration_minutes: Math.max(5, parseInt(e.target.value || "0", 10) || 0) })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">min</span></div>
                            </div>
                            <div className="space-y-1.5"><Label>Price</Label><Money value={t.price_cents} onChange={(v) => upd(t.id, { price_cents: v })} /></div>
                            <div className="space-y-1.5"><Label>Member price</Label><Money value={t.member_price_cents} onChange={(v) => upd(t.id, { member_price_cents: v })} placeholder="same" /></div>
                            <div className="space-y-1.5"><Label>Results last</Label>
                              <div className="relative"><Input inputMode="numeric" value={t.recall_weeks ?? ""} placeholder="—" onChange={(e) => { const v = parseInt(e.target.value || "0", 10); upd(t.id, { recall_weeks: v > 0 ? v : null }); }} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">wks</span></div>
                            </div>
                          </div>
                          <div className="rounded-xl bg-white p-3 text-xs text-muted-foreground ring-1 ring-zinc-200">
                            {t.recall_weeks
                              ? <>A patient treated today is <b className="text-zinc-800">due {new Date(Date.now() + t.recall_weeks * 7 * 86_400_000).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</b>. Her app shows the countdown; recall messages use the timing on this page.</>
                              : <>No recall window: this treatment never marks a patient as due (right for consults and one-offs).</>}
                          </div>
                          <div className="space-y-1.5">
                            <Label>Aftercare <span className="font-normal text-muted-foreground">(one instruction per line, shown in the app after this treatment)</span></Label>
                            <textarea className="min-h-[96px] w-full rounded-md border bg-white px-3 py-2 text-sm" value={t.aftercare.join("\n")} onChange={(e) => upd(t.id, { aftercare: e.target.value.split("\n").map((l) => l.replace(/^[-•]\s*/, "")).filter((l, idx, arr) => l.trim() || idx === arr.length - 1) })} placeholder={"Stay upright for 4 hours\nSkip workouts today"} />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <ImageUploader bucket="business-heroes" pathPrefix={`medspa/${business.id}/treatments`} value={t.image_url} onChange={(url) => upd(t.id, { image_url: url })} label="Photo" aspectClass="aspect-square" library={{ category: "offer", industry: "medspa" }} />
                          <Button variant="ghost" size="sm" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { set(list.filter((x) => x.id !== t.id)); setOpenId(null); }}><Trash2 className="mr-1.5 h-4 w-4" />Remove treatment</Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add treatment</Button>
              <Button variant="ghost" onClick={loadStarter} className="text-muted-foreground"><Sparkles className="mr-1.5 h-4 w-4" />Add the rest of the starter menu</Button>
            </div>
          </>
        )}
      </Card>

      <RecallEditor business={business} cfg={cfg} onChange={onChange} />
    </div>
  );
}

function RecallEditor({ business, cfg, onChange }: EditorProps) {
  const r = cfg.recall;
  const set = (p: Partial<MedspaConfig["recall"]>) => onChange({ ...cfg, recall: { ...r, ...p } });
  const sample = cfg.treatments.find((t) => t.recall_weeks) ?? null;
  const vars = { first_name: "Maya", treatment: sample?.name ?? "treatment", practice: business.name, due_date: new Date(Date.now() + 10 * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" }), incentive: r.incentive };
  return (
    <Card icon={<BellRing className="h-4 w-4" />} title="Recall reminders"
      subtitle="When a patient hears from you around her due date, and what the message says. Timing is per treatment (set above)."
      aside={<Status kind="stored">Saved · sending ships with the recall engine</Status>}>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        What you set here is saved and previewed in the app today. Automatic sending is the next build; until it ships, the front desk sees who is due under Patients and can message them from there.
      </div>
      <div className="flex items-center justify-between rounded-xl border p-3">
        <div><div className="text-sm font-semibold">Send recall reminders automatically</div><div className="text-xs text-muted-foreground">Turns on the moment the engine ships. Off = due dates still show in the app, nothing sends.</div></div>
        <Switch checked={r.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>First reminder</Label>
          <div className="flex items-center gap-2"><Input className="w-20" inputMode="numeric" value={r.lead_days} onChange={(e) => set({ lead_days: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })} /><span className="text-sm text-muted-foreground">days before due</span></div>
        </div>
        <div className="space-y-1.5"><Label>Quiet-patient follow-up</Label>
          <div className="flex items-center gap-2"><Input className="w-20" inputMode="numeric" value={r.followup_days} onChange={(e) => set({ followup_days: Math.max(1, parseInt(e.target.value || "0", 10) || 0) })} /><span className="text-sm text-muted-foreground">days after due</span></div>
        </div>
        <div className="space-y-1.5"><Label>Channel</Label>
          <div className="flex gap-1.5">{(["push", "sms", "both"] as const).map((c) => <Pill key={c} on={r.channel === c} onClick={() => set({ channel: c })}>{c === "both" ? "Push + SMS" : c.toUpperCase()}</Pill>)}</div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Due reminder</Label><textarea className="min-h-[88px] w-full rounded-md border px-3 py-2 text-sm" value={r.message_due} onChange={(e) => set({ message_due: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Follow-up if she hasn&apos;t booked</Label><textarea className="min-h-[88px] w-full rounded-md border px-3 py-2 text-sm" value={r.message_followup} onChange={(e) => set({ message_followup: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Sweetener <span className="font-normal text-muted-foreground">(optional, fills {"{incentive}"})</span></Label><Input value={r.incentive} onChange={(e) => set({ incentive: e.target.value })} placeholder="Book by Friday and your LED add-on is on us." /></div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">Tokens: {RECALL_TOKENS.map((t) => <code key={t} className="rounded bg-zinc-100 px-1.5 py-0.5">{t}</code>)}</div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview on her phone</div>
          <div className="space-y-2 rounded-[28px] bg-gradient-to-b from-zinc-100 to-zinc-200 p-4">
            {[fillTemplate(r.message_due, vars), fillTemplate(r.message_followup, vars)].map((m, i) => (
              <div key={i} className="rounded-2xl bg-white/95 p-3 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start gap-2.5">
                  {business.app_icon_url || business.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={(business.app_icon_url || business.logo_url)!} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  ) : <span className="grid h-8 w-8 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: business.brand_colors.primary }}>{business.name.slice(0, 2).toUpperCase()}</span>}
                  <div className="min-w-0 text-[13px]">
                    <div className="flex justify-between gap-2 text-[11px] text-zinc-500"><b className="text-zinc-800">{business.name}</b><span>{i === 0 ? `${r.lead_days}d before due` : `${r.followup_days}d after`}</span></div>
                    <p className="mt-0.5 leading-snug text-zinc-800">{m}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!sample && <p className="mt-2 text-xs text-muted-foreground">Add a treatment with a recall window to preview with its name.</p>}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── 2. credits ───────────────────────── */

export function CreditsEditor({ cfg, onChange }: EditorProps) {
  const c = cfg.credits;
  const set = (p: Partial<MedspaConfig["credits"]>) => onChange({ ...cfg, credits: { ...c, ...p } });
  const eligible = cfg.treatments.filter((t) => t.is_active && t.price_cents);
  return (
    <Card icon={<Wallet className="h-4 w-4" />} title="Banked treatment credits"
      subtitle="Members pay monthly and bank a credit toward treatments. The member card in the app shows the balance; the front desk applies it when logging a treatment."
      aside={<Status kind="estimate">Balance is estimated until the credit ledger ships</Status>}>
      <div className="flex items-center justify-between rounded-xl border p-3">
        <div><div className="text-sm font-semibold">Membership banks a monthly credit</div><div className="text-xs text-muted-foreground">Set the membership price and perks on the Membership section below; this is the credit side.</div></div>
        <Switch checked={c.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </div>
      <div className={cn("grid gap-4 sm:grid-cols-3", !c.enabled && "pointer-events-none opacity-50")}>
        <div className="space-y-1.5"><Label>Credit per month</Label><Money value={c.monthly_credit_cents || null} onChange={(v) => set({ monthly_credit_cents: v ?? 0 })} placeholder="150" /></div>
        <div className="space-y-1.5"><Label>Unused credit rolls over</Label>
          <div className="flex gap-1.5">{[0, 1, 2, 3, 6].map((m) => <Pill key={m} on={c.rollover_months === m} onClick={() => set({ rollover_months: m })}>{m === 0 ? "No" : `${m} mo`}</Pill>)}</div>
        </div>
        <div className="space-y-1.5"><Label>Note under the balance</Label><Input value={c.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </div>
      {c.enabled && c.monthly_credit_cents > 0 && (
        <div className="grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-muted-foreground">After 3 months, a member has banked</div><div className="text-xl font-bold">{cents(Math.min(3, c.rollover_months + 1) * c.monthly_credit_cents)}</div></div>
          <div><div className="text-xs text-muted-foreground">That covers</div><div className="text-sm font-medium leading-snug">{eligible.length ? eligible.filter((t) => (t.member_price_cents ?? t.price_cents ?? Infinity) <= Math.min(3, c.rollover_months + 1) * c.monthly_credit_cents).map((t) => t.name).slice(0, 4).join(", ") || "none of the priced treatments yet" : "add prices to treatments to see this"}</div></div>
          <div><div className="text-xs text-muted-foreground">How it works today</div><div className="text-xs leading-snug text-zinc-700">Balance = months paid × credit (capped by rollover) − credit the desk applied on logged treatments.</div></div>
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────── 3. providers ───────────────────────── */

export function ProvidersEditor({ business, cfg, onChange }: EditorProps) {
  const list = cfg.providers;
  const set = (providers: MedspaProvider[]) => onChange({ ...cfg, providers });
  const upd = (id: string, p: Partial<MedspaProvider>) => set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = () => set([...list, { id: newId("pv"), name: "", title: "", bio: "", photo_url: null, treatment_ids: [], is_active: true }]);
  return (
    <div className="space-y-6">
      <Card icon={<Users className="h-4 w-4" />} title="Your providers"
        subtitle="Injectors, estheticians and your medical director. Patients see them on Home and under each treatment; it builds trust before the first visit."
        aside={<Status kind="live">Live in the patient app</Status>}>
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div><div className="text-sm font-semibold">Let patients choose a provider when booking</div><div className="text-xs text-muted-foreground">Shown as a preference on the booking screen; the desk assigns the actual provider until booking carries providers natively.</div></div>
          <Switch checked={cfg.pick_provider} onCheckedChange={(v) => onChange({ ...cfg, pick_provider: v })} />
        </div>
        {list.length === 0 && <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center text-sm text-muted-foreground">No providers yet. Add the people patients will meet.</div>}
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <div key={p.id} className={cn("rounded-2xl border p-4", !p.is_active && "opacity-60")}>
              <div className="flex gap-4">
                <div className="w-24 shrink-0"><ImageUploader bucket="business-heroes" pathPrefix={`medspa/${business.id}/providers`} value={p.photo_url} onChange={(url) => upd(p.id, { photo_url: url })} label="Photo" aspectClass="aspect-square" /></div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} placeholder="Full name" />
                  <Input value={p.title} onChange={(e) => upd(p.id, { title: e.target.value })} placeholder="Nurse injector, RN" />
                </div>
              </div>
              <textarea className="mt-3 min-h-[64px] w-full rounded-md border px-3 py-2 text-sm" value={p.bio} onChange={(e) => upd(p.id, { bio: e.target.value })} placeholder="Two sentences patients will read: training, years, what they're known for." />
              {cfg.treatments.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Performs <span className="font-normal">(none selected = everything)</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    {cfg.treatments.filter((t) => t.is_active).map((t) => {
                      const on = p.treatment_ids.includes(t.id);
                      return <Pill key={t.id} on={on} onClick={() => upd(p.id, { treatment_ids: on ? p.treatment_ids.filter((x) => x !== t.id) : [...p.treatment_ids, t.id] })}>{t.name || "Untitled"}</Pill>;
                    })}
                  </div>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={p.is_active} onCheckedChange={(v) => upd(p.id, { is_active: v })} />Shown in app</label>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => set(list.filter((x) => x.id !== p.id))}><Trash2 className="mr-1.5 h-4 w-4" />Remove</Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add provider</Button>
      </Card>
    </div>
  );
}

/* ───────────────────────── 4. aftercare + my care tab ───────────────────────── */

export function AftercareEditor({ cfg, onChange }: EditorProps) {
  const withCare = cfg.treatments.filter((t) => t.is_active);
  const upd = (id: string, aftercare: string[]) => onChange({ ...cfg, treatments: cfg.treatments.map((t) => (t.id === id ? { ...t, aftercare } : t)) });
  const copyFrom = (fromId: string, toId: string) => { const src = cfg.treatments.find((t) => t.id === fromId); if (src) upd(toId, [...src.aftercare]); };
  return (
    <div className="space-y-6">
      <Card icon={<ShieldCheck className="h-4 w-4" />} title="Aftercare, by treatment"
        subtitle="What the patient sees in her app the moment the desk logs the treatment. Fewer calls to the front desk, better results, and she keeps the app open."
        aside={<Status kind="live">Live in the patient app</Status>}>
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div><div className="text-sm font-semibold">Show &ldquo;My care&rdquo; in the patient app</div><div className="text-xs text-muted-foreground">Her treatment history, aftercare for each, and when she&apos;s next due.</div></div>
          <Switch checked={cfg.show_history} onCheckedChange={(v) => onChange({ ...cfg, show_history: v })} />
        </div>
        <div className="space-y-1.5"><Label>Before her first logged treatment, My care says</Label><Input value={cfg.welcome_note} onChange={(e) => onChange({ ...cfg, welcome_note: e.target.value })} /></div>
        {withCare.length === 0 && <p className="text-sm text-muted-foreground">Add treatments first; aftercare is written per treatment.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {withCare.map((t) => (
            <div key={t.id} className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{t.name || "Untitled"} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.aftercare.filter(Boolean).length} steps</span></div>
                {withCare.some((o) => o.id !== t.id && o.aftercare.length) && (
                  <select className="rounded-md border bg-white px-2 py-1 text-xs" value="" onChange={(e) => { if (e.target.value) copyFrom(e.target.value, t.id); }}>
                    <option value="">Copy from…</option>
                    {withCare.filter((o) => o.id !== t.id && o.aftercare.length).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
              </div>
              <textarea className="mt-2 min-h-[110px] w-full rounded-md border px-3 py-2 text-sm" value={t.aftercare.join("\n")} onChange={(e) => upd(t.id, e.target.value.split("\n").map((l) => l.replace(/^[-•]\s*/, "")))} placeholder={"One instruction per line"} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────── 5. gallery ───────────────────────── */

export function GalleryEditor({ business, cfg, onChange }: EditorProps) {
  const list = cfg.gallery;
  const set = (gallery: MedspaGalleryItem[]) => onChange({ ...cfg, gallery });
  const upd = (id: string, p: Partial<MedspaGalleryItem>) => set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = () => set([...list, { id: newId("gl"), title: "", treatment_id: null, before_url: null, after_url: null, caption: "", consent: false }]);
  const live = list.filter((g) => g.consent && g.before_url && g.after_url).length;
  return (
    <div className="space-y-6">
      <Card icon={<Images className="h-4 w-4" />} title="Before &amp; after gallery"
        subtitle="Your results, in your app, where a patient looks before she books. Only pairs with consent on file ever show."
        aside={<Status kind="live">{live} of {list.length} showing in app</Status>}>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
          Patient-facing gallery only. Private per-patient progress photos (taken at the desk, visible only to that patient) are on the roadmap; this page does not store those.
        </div>
        {list.length === 0 && <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center text-sm text-muted-foreground">No pairs yet. Add your best results first.</div>}
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((g) => (
            <div key={g.id} className="rounded-2xl border p-4">
              <div className="grid grid-cols-2 gap-3">
                <ImageUploader bucket="business-heroes" pathPrefix={`medspa/${business.id}/gallery`} value={g.before_url} onChange={(url) => upd(g.id, { before_url: url })} label="Before" aspectClass="aspect-[4/5]" />
                <ImageUploader bucket="business-heroes" pathPrefix={`medspa/${business.id}/gallery`} value={g.after_url} onChange={(url) => upd(g.id, { after_url: url })} label="After" aspectClass="aspect-[4/5]" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input value={g.title} onChange={(e) => upd(g.id, { title: e.target.value })} placeholder="Lip filler, 1 syringe" />
                <select className="rounded-md border bg-white px-3 py-2 text-sm" value={g.treatment_id ?? ""} onChange={(e) => upd(g.id, { treatment_id: e.target.value || null })}>
                  <option value="">Treatment (optional)</option>
                  {cfg.treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <Input className="mt-2" value={g.caption} onChange={(e) => upd(g.id, { caption: e.target.value })} placeholder="Caption: '2 weeks after, no filter'" />
              <div className="mt-3 flex items-center justify-between">
                <label className={cn("flex items-center gap-2 text-xs", g.consent ? "text-emerald-700" : "text-amber-700")}><Switch checked={g.consent} onCheckedChange={(v) => upd(g.id, { consent: v })} />{g.consent ? "Consent on file · showing" : "No consent yet · hidden"}</label>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => set(list.filter((x) => x.id !== g.id))}><Trash2 className="mr-1.5 h-4 w-4" />Remove</Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add a before &amp; after</Button>
      </Card>
    </div>
  );
}

void Copy;
