"use client";
/**
 * Desk → App builder (Dermis-style). Only what the med spa app and the desk
 * use, nothing venue-specific. Saves the same businesses columns the patient
 * app reads (medspa_config, brand, contact), so the app updates on next open.
 *
 *   Brand        · name, logo, app icon, colour, home photo (Atlas admins only)
 *   Clinic       · phone, address, Google review link, welcome line
 *   Treatments   · the menu (price, member price, recall, aftercare, booking link, photo)
 *   Memberships  · plans (medspa_config.memberships)
 *   Shop         · on/off, how patients pay, pay over time, items
 *   Booking      · the one way patients book
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@atlas/core/supabase/client";
import type { BuilderData } from "@/lib/builder-data";
import { BOOKING_METHOD_LABEL, MEDSPA_CATEGORIES, MEDSPA_STARTER_SHOP, MEDSPA_STARTER_TREATMENTS, cleanUrl, newId, readMedspaConfig, type BookingMethod, type MedspaConfig, type MedspaShopItem, type MedspaTreatment } from "@/lib/medspa";
import type { MedspaPlan } from "@/lib/plans";
import { Modal } from "./ui";
import { IcBag, IcCalendar, IcGift, IcSpark, IcUser } from "../icons";

type Section = "brand" | "clinic" | "treatments" | "memberships" | "shop" | "booking";
type Cfg = MedspaConfig & { memberships?: MedspaPlan[] };
const shadow = "shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]";
const dollars = (c: number | null | undefined) => (c == null ? "" : String(c / 100));
const toCents = (v: string) => { const n = parseFloat(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const price = (c: number | null | undefined) => (c == null || c <= 0 ? "No price yet" : `$${(c / 100).toLocaleString("en-US")}`);

export function BuilderView({ clinic, canBrand, initial, say }: {
  clinic: { id: string; slug: string; demo: boolean }; canBrand: boolean; initial: BuilderData; say: (t: string) => void;
}) {
  const [d, setD] = useState<BuilderData>(initial);
  const [cfg, setCfg] = useState<Cfg>(() => readMedspaConfig(initial.cfg) as Cfg);
  const [base, setBase] = useState(() => JSON.stringify([initial, readMedspaConfig(initial.cfg)]));
  const [section, setSection] = useState<Section>(canBrand ? "brand" : "clinic");
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify([d, cfg]) !== base, [d, cfg, base]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function upload(file: File, bucket: "business-heroes" | "business-logos", folder: string): Promise<string | null> {
    if (clinic.demo) return URL.createObjectURL(file);
    const sb = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${clinic.id}/${folder}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: "31536000", contentType: file.type || undefined });
    if (error) { say(error.message); return null; }
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    setSaving(true);
    try {
      if (!clinic.demo) {
        const patch: Record<string, unknown> = {
          medspa_config: cfg,
          contact_info: { ...d.contactRaw, phone: d.phone.trim(), address: d.address.trim() },
          google_review_url: d.google_review_url.trim() || null,
          welcome_message: d.welcome_message.trim() || null,
        };
        if (canBrand) Object.assign(patch, { name: d.name.trim(), logo_url: d.logo_url, app_icon_url: d.app_icon_url, hero_image_url: d.hero_image_url, brand_colors: { ...d.brandRaw, primary: d.primary } });
        const { error } = await createClient().from("businesses").update(patch).eq("id", clinic.id);
        if (error) throw new Error(error.message);
      }
      setBase(JSON.stringify([d, cfg]));
      say(clinic.demo ? "Saved (demo: not stored)" : "Saved · live in the app");
    } catch (e) { say((e as Error).message); }
    setSaving(false);
  }

  const SECTIONS: { id: Section; label: string; hint: string; Icon: typeof IcUser }[] = [
    ...(canBrand ? [{ id: "brand" as const, label: "Brand", hint: "Name, logo, colour", Icon: IcSpark }] : []),
    { id: "clinic", label: "Clinic details", hint: "Phone, address, reviews", Icon: IcUser },
    { id: "treatments", label: "Treatments", hint: `${cfg.treatments.length} on the menu`, Icon: IcSpark },
    { id: "memberships", label: "Memberships", hint: `${(cfg.memberships ?? []).length} plans`, Icon: IcGift },
    { id: "shop", label: "Shop", hint: cfg.shop.enabled ? `${cfg.shop.items.length} items` : "Off", Icon: IcBag },
    { id: "booking", label: "Booking", hint: cfg.booking.method ? BOOKING_METHOD_LABEL[cfg.booking.method] : "Not chosen", Icon: IcCalendar },
  ];

  return (
    <div className="pb-28">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col">
          {SECTIONS.map(({ id, label, hint, Icon }) => (
            <button key={id} type="button" onClick={() => setSection(id)}
              className={`flex shrink-0 items-center gap-3 rounded-[18px] px-4 py-3 text-left transition ${section === id ? `bg-white ${shadow}` : "hover:bg-white/60"}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-full ${section === id ? "bg-tint text-brand" : "bg-white text-sub"}`}><Icon className="h-[18px] w-[18px]" /></span>
              <span><span className="block text-[14.5px] font-semibold">{label}</span><span className="block text-[12.5px] text-faint">{hint}</span></span>
            </button>
          ))}
          <a href={`/${clinic.slug}`} target="_blank" rel="noopener noreferrer" className="mt-2 hidden rounded-[18px] border border-dashed border-line px-4 py-3 text-[13.5px] font-medium text-sub hover:text-ink lg:block">Open the patient app ↗</a>
        </nav>

        <div className="min-w-0 space-y-5">
          {section === "brand" && canBrand && <BrandSection d={d} set={(p) => setD({ ...d, ...p })} upload={upload} />}
          {section === "clinic" && <ClinicSection d={d} set={(p) => setD({ ...d, ...p })} />}
          {section === "treatments" && <TreatmentsSection cfg={cfg} setCfg={setCfg} upload={upload} />}
          {section === "memberships" && <PlansSection cfg={cfg} setCfg={setCfg} upload={upload} />}
          {section === "shop" && <ShopSection cfg={cfg} setCfg={setCfg} upload={upload} />}
          {section === "booking" && <BookingSection cfg={cfg} setCfg={setCfg} />}
        </div>
      </div>

      <div className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${dirty ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto mb-5 flex w-fit items-center gap-4 rounded-full bg-ink py-2.5 pl-6 pr-2.5 text-white shadow-2xl">
          <span className="text-[14.5px]">Unsaved changes</span>
          <button type="button" onClick={() => { const [b0, c0] = JSON.parse(base) as [BuilderData, Cfg]; setD(b0); setCfg(c0); }} className="h-10 rounded-full px-4 text-[14px] font-semibold text-white/75 hover:text-white">Discard</button>
          <button type="button" disabled={saving} onClick={save} className="h-10 rounded-full bg-white px-5 text-[14px] font-semibold text-ink">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── shared pieces ───────────────────────── */

type Upload = (file: File, bucket: "business-heroes" | "business-logos", folder: string) => Promise<string | null>;

function Panel({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className={`rounded-[26px] bg-white p-6 ${shadow}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>{sub && <p className="mt-1 max-w-[62ch] text-[14px] text-sub">{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-sub">{label}</span>{children}{hint && <span className="mt-1 block text-[12.5px] text-faint">{hint}</span>}</label>;
}
function Text({ value, onChange, placeholder, inputMode, area }: { value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "decimal" | "numeric" | "tel" | "url"; area?: boolean }) {
  return area
    ? <textarea className="field h-24 resize-none py-3" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    : <input className="field" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} />;
}
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[1.4rem]" : "left-0.5"}`} />
    </button>
  );
}
function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] bg-page px-4 py-3.5">
      <span><span className="block text-[14.5px] font-semibold">{title}</span>{sub && <span className="block text-[13px] text-sub">{sub}</span>}</span>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}
function Segmented<T extends string>({ value, options, onChange }: { value: T | null; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full bg-page p-1">
      {options.map((o) => <button key={o.id} type="button" onClick={() => onChange(o.id)} className={`h-9 rounded-full px-4 text-[13.5px] font-semibold ${value === o.id ? "bg-white text-ink shadow-card" : "text-sub"}`}>{o.label}</button>)}
    </div>
  );
}
function Photo({ url, onChange, upload, bucket = "business-heroes", folder, aspect = "aspect-[4/3]", label = "Add a photo", gray }: {
  url: string | null; onChange: (u: string | null) => void; upload: Upload; bucket?: "business-heroes" | "business-logos"; folder: string; aspect?: string; label?: string; gray?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => ref.current?.click()} className={`relative block w-full overflow-hidden rounded-[18px] bg-page ${aspect}`}>
        {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" className={`h-full w-full object-cover ${gray ? "grayscale" : ""}`} />
          : <span className="grid h-full place-items-center px-3 text-center text-[13.5px] text-sub">{busy ? "Uploading…" : label}</span>}
        {url && <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-3 py-1 text-[12px] font-semibold">{busy ? "Uploading…" : "Change"}</span>}
      </button>
      {url && <button type="button" onClick={() => onChange(null)} className="mt-1.5 text-[12.5px] text-faint hover:text-red-600">Remove</button>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); const u = await upload(f, bucket, folder); setBusy(false); if (u) onChange(u); }} />
    </div>
  );
}
function Row({ img, title, meta, on, onToggle, onClick, badge }: { img: string | null; title: string; meta: string; on: boolean; onToggle: (v: boolean) => void; onClick: () => void; badge?: string }) {
  return (
    <li>
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }} className={`flex cursor-pointer items-center gap-4 px-4 py-3.5 transition hover:bg-page ${on ? "" : "opacity-55"}`}>
        {img ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" className="h-12 w-12 shrink-0 rounded-[14px] object-cover" />
          : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-page text-[13px] font-semibold text-sub">{(title || "?").slice(0, 2).toUpperCase()}</span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="truncate text-[15px] font-semibold">{title || "Untitled"}</span>{badge && <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-brand">{badge}</span>}</span>
          <span className="block truncate text-[13px] text-sub">{meta}</span>
        </span>
        <Switch on={on} onChange={onToggle} label="Shown in the app" />
      </div>
    </li>
  );
}
function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="h-10 rounded-full bg-ink px-4 text-[14px] font-semibold text-white">{children}</button>;
}
function Lines({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return <textarea className="field h-28 resize-none py-3" value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} onBlur={() => onChange(value.map((s) => s.trim()).filter(Boolean))} placeholder={placeholder} />;
}

/* ───────────────────────── Brand · Clinic ───────────────────────── */

function BrandSection({ d, set, upload }: { d: BuilderData; set: (p: Partial<BuilderData>) => void; upload: Upload }) {
  return (
    <Panel title="Brand" sub="How the clinic looks in the patient app. Only Atlas admins can change this, so every app stays on-brand.">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Clinic name"><Text value={d.name} onChange={(v) => set({ name: v })} /></Field>
        <Field label="Brand colour" hint="Buttons, highlights and the progress bars.">
          <div className="flex items-center gap-3">
            <input type="color" value={d.primary} onChange={(e) => set({ primary: e.target.value })} className="h-[52px] w-16 cursor-pointer rounded-[14px] border border-line bg-white p-1" aria-label="Brand colour" />
            <input className="field" value={d.primary} onChange={(e) => set({ primary: e.target.value })} />
          </div>
        </Field>
        <Field label="Logo" hint="Wide logos look best. PNG with a clear background."><Photo url={d.logo_url} onChange={(u) => set({ logo_url: u })} upload={upload} bucket="business-logos" folder="logo" aspect="aspect-[3/1]" label="Add logo" /></Field>
        <Field label="App icon" hint="Square, used on the Home Screen."><div className="w-32"><Photo url={d.app_icon_url} onChange={(u) => set({ app_icon_url: u })} upload={upload} bucket="business-logos" folder="icon" aspect="aspect-square" label="Add icon" /></div></Field>
        <div className="md:col-span-2"><Field label="Home photo" hint="The big photo at the top of the app's Home."><Photo url={d.hero_image_url} onChange={(u) => set({ hero_image_url: u })} upload={upload} folder="hero" aspect="aspect-[16/7]" label="Add home photo" /></Field></div>
      </div>
    </Panel>
  );
}

function ClinicSection({ d, set }: { d: BuilderData; set: (p: Partial<BuilderData>) => void }) {
  return (
    <Panel title="Clinic details" sub="Shown on Home and used by the Call and Text buttons.">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Phone"><Text value={d.phone} onChange={(v) => set({ phone: v })} inputMode="tel" placeholder="(805) 555-0142" /></Field>
        <Field label="Address"><Text value={d.address} onChange={(v) => set({ address: v })} placeholder="123 Main St, San Luis Obispo, CA" /></Field>
        <Field label="Google review link" hint="Patients earn points for a review."><Text value={d.google_review_url} onChange={(v) => set({ google_review_url: v })} inputMode="url" placeholder="https://g.page/r/…" /></Field>
        <Field label="Welcome line" hint="Optional short line for new patients."><Text value={d.welcome_message} onChange={(v) => set({ welcome_message: v })} placeholder="Welcome! Your rewards start today." /></Field>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Treatments ───────────────────────── */

function TreatmentsSection({ cfg, setCfg, upload }: { cfg: Cfg; setCfg: (c: Cfg) => void; upload: Upload }) {
  const [edit, setEdit] = useState<MedspaTreatment | null>(null);
  const list = cfg.treatments;
  const put = (t: MedspaTreatment) => setCfg({ ...cfg, treatments: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t] });
  const blank = (): MedspaTreatment => ({ id: newId("tr"), name: "", category: "Injectables", recall_weeks: 12, duration_minutes: 30, price_cents: null, member_price_cents: null, description: "", aftercare: [], image_url: null, is_active: true, booking_url: null });
  return (
    <Panel title="Treatments" sub="Your menu. The recall window is how the desk knows who's due, and the aftercare shows in the app after a visit."
      action={<AddBtn onClick={() => setEdit(blank())}>Add treatment</AddBtn>}>
      {list.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-line px-6 py-8 text-center">
          <p className="text-[15px] font-semibold">No treatments yet</p>
          <p className="mt-1 text-[14px] text-sub">Start from a typical med spa menu, then edit names and prices.</p>
          <button type="button" onClick={() => setCfg({ ...cfg, treatments: MEDSPA_STARTER_TREATMENTS.map((s) => ({ ...s, id: newId("tr") })) })} className="mt-4 h-10 rounded-full bg-tint px-5 text-[14px] font-semibold text-brand">Load starter menu</button>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line">
          {list.map((t) => <Row key={t.id} img={t.image_url} title={t.name} on={t.is_active} onClick={() => setEdit({ ...t })} onToggle={(v) => put({ ...t, is_active: v })}
            meta={[t.category, `${t.duration_minutes} min`, price(t.price_cents), t.recall_weeks ? `due again in ${t.recall_weeks} wk` : "no recall"].join(" · ")} />)}
        </ul>
      )}
      {edit && (
        <Modal wide title={list.some((x) => x.id === edit.id) ? "Edit treatment" : "New treatment"} onClose={() => setEdit(null)}>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-4">
              <Field label="Name"><Text value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} placeholder="Neurotoxin" /></Field>
              <Field label="Category"><Segmented value={edit.category as typeof MEDSPA_CATEGORIES[number]} options={MEDSPA_CATEGORIES.map((c) => ({ id: c, label: c }))} onChange={(v) => setEdit({ ...edit, category: v })} /></Field>
            </div>
            <Field label="Photo"><Photo url={edit.image_url} onChange={(u) => setEdit({ ...edit, image_url: u })} upload={upload} folder="medspa/treatments" aspect="aspect-square" /></Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Price ($)"><Text value={dollars(edit.price_cents)} onChange={(v) => setEdit({ ...edit, price_cents: toCents(v) })} inputMode="decimal" placeholder="350" /></Field>
            <Field label="Member price ($)"><Text value={dollars(edit.member_price_cents)} onChange={(v) => setEdit({ ...edit, member_price_cents: toCents(v) })} inputMode="decimal" placeholder="Same" /></Field>
            <Field label="Minutes"><Text value={String(edit.duration_minutes || "")} onChange={(v) => setEdit({ ...edit, duration_minutes: parseInt(v.replace(/\D/g, "") || "0", 10) })} inputMode="numeric" /></Field>
            <Field label="Due again (weeks)"><Text value={edit.recall_weeks ? String(edit.recall_weeks) : ""} onChange={(v) => setEdit({ ...edit, recall_weeks: parseInt(v.replace(/\D/g, "") || "0", 10) || null })} inputMode="numeric" placeholder="None" /></Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Description"><Text area value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} placeholder="What it does and who it's for." /></Field>
            <Field label="Aftercare (one per line)"><Lines value={edit.aftercare} onChange={(v) => setEdit({ ...edit, aftercare: v })} placeholder={"Stay upright for 4 hours\nSkip workouts today"} /></Field>
            <Field label="Booking link for this treatment" hint="Optional: its page on your booking system. Blank = your general booking link."><Text value={edit.booking_url ?? ""} onChange={(v) => setEdit({ ...edit, booking_url: v || null })} inputMode="url" placeholder="https://…" /></Field>
            {edit.booking_url && !cleanUrl(edit.booking_url) && <p className="text-[13px] text-red-600">That doesn&apos;t look like a web link.</p>}
          </div>
          <div className="mt-6 flex gap-2">
            <button type="button" className="btn-ink" disabled={!edit.name.trim()} onClick={() => { put({ ...edit, name: edit.name.trim(), aftercare: edit.aftercare.map((s) => s.trim()).filter(Boolean) }); setEdit(null); }}>Done</button>
            {list.some((x) => x.id === edit.id) && <button type="button" onClick={() => { setCfg({ ...cfg, treatments: list.filter((x) => x.id !== edit.id) }); setEdit(null); }} className="h-[52px] shrink-0 rounded-full px-5 text-[14px] font-semibold text-red-600">Delete</button>}
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ───────────────────────── Memberships ───────────────────────── */

function PlansSection({ cfg, setCfg, upload }: { cfg: Cfg; setCfg: (c: Cfg) => void; upload: Upload }) {
  const [edit, setEdit] = useState<MedspaPlan | null>(null);
  const plans = cfg.memberships ?? [];
  const put = (p: MedspaPlan) => setCfg({ ...cfg, memberships: plans.some((x) => x.id === p.id) ? plans.map((x) => (x.id === p.id ? p : x)) : [...plans, p] });
  const blank = (): MedspaPlan => ({ id: newId("pl"), name: "", tagline: "", description: "", price_cents: 0, commitment_months: 0, image_url: null, benefits: [], included: [], join_bonus: "", featured: plans.length === 0, is_active: true });
  const treatments = cfg.treatments.filter((t) => t.is_active);
  return (
    <Panel title="Memberships" sub="The plans patients subscribe to in the app (paid monthly through your Stripe). Each plan lists its benefits and what's included every month."
      action={<AddBtn onClick={() => setEdit(blank())}>Add plan</AddBtn>}>
      {plans.length === 0 ? <p className="rounded-[20px] border border-dashed border-line px-6 py-8 text-center text-[14px] text-sub">No plans yet. Until you add one, the app shows your single membership.</p> : (
        <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line">
          {plans.map((p) => <Row key={p.id} img={p.image_url} title={p.name} on={p.is_active} badge={p.featured ? "Featured" : undefined} onClick={() => setEdit({ ...p })} onToggle={(v) => put({ ...p, is_active: v })}
            meta={[p.price_cents ? `$${p.price_cents / 100}/mo` : "No price yet", p.commitment_months ? `${p.commitment_months}-month minimum` : "Cancel anytime", `${p.included.length} included`].join(" · ")} />)}
        </ul>
      )}
      {edit && (
        <Modal wide title={plans.some((x) => x.id === edit.id) ? "Edit plan" : "New plan"} onClose={() => setEdit(null)}>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-4">
              <Field label="Plan name"><Text value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} placeholder="Glow Club" /></Field>
              <Field label="One-line tagline"><Text value={edit.tagline} onChange={(v) => setEdit({ ...edit, tagline: v })} placeholder="A facial every month" /></Field>
            </div>
            <Field label="Photo" hint="Shown black & white."><Photo url={edit.image_url} onChange={(u) => setEdit({ ...edit, image_url: u })} upload={upload} folder="medspa/plans" aspect="aspect-square" gray /></Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Monthly price ($)"><Text value={edit.price_cents ? String(edit.price_cents / 100) : ""} onChange={(v) => setEdit({ ...edit, price_cents: toCents(v) ?? 0 })} inputMode="decimal" placeholder="99" /></Field>
            <Field label="Minimum months"><Text value={edit.commitment_months ? String(edit.commitment_months) : ""} onChange={(v) => setEdit({ ...edit, commitment_months: parseInt(v.replace(/\D/g, "") || "0", 10) })} inputMode="numeric" placeholder="0 = cancel anytime" /></Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Description"><Text area value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} /></Field>
            <Field label="Benefits (one per line)"><Lines value={edit.benefits} onChange={(v) => setEdit({ ...edit, benefits: v })} placeholder={"Member pricing on every treatment\n10% off skincare"} /></Field>
            <Field label="Included every month">
              <div className="space-y-2">
                {edit.included.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className="field flex-1" value={it.treatment_id ?? ""} onChange={(e) => { const t = treatments.find((x) => x.id === e.target.value); setEdit({ ...edit, included: edit.included.map((x, j) => (j === i ? { ...x, treatment_id: t?.id ?? null, name: t?.name ?? x.name } : x)) }); }}>
                      {treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <input className="field w-20" inputMode="numeric" value={String(it.quantity)} onChange={(e) => setEdit({ ...edit, included: edit.included.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, parseInt(e.target.value.replace(/\D/g, "") || "1", 10)) } : x)) })} aria-label="Quantity" />
                    <select className="field w-32" value={it.unit} onChange={(e) => setEdit({ ...edit, included: edit.included.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} aria-label="Unit">
                      {["session", "unit", "syringe", "mL", "credit"].map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <button type="button" onClick={() => setEdit({ ...edit, included: edit.included.filter((_, j) => j !== i) })} className="px-2 text-[20px] text-faint hover:text-red-600" aria-label="Remove">×</button>
                  </div>
                ))}
                {treatments.length > 0 && <button type="button" onClick={() => setEdit({ ...edit, included: [...edit.included, { treatment_id: treatments[0].id, name: treatments[0].name, quantity: 1, unit: "session", note: "" }] })} className="h-9 rounded-full bg-page px-4 text-[13.5px] font-semibold">Add included treatment</button>}
              </div>
            </Field>
            <Field label="Join bonus" hint="Small print under Subscribe."><Text value={edit.join_bonus} onChange={(v) => setEdit({ ...edit, join_bonus: v })} placeholder="Free skin consultation when you join" /></Field>
            <Toggle on={edit.featured} onChange={(v) => setEdit({ ...edit, featured: v })} title="Featured plan" sub="Shown first and highlighted" />
          </div>
          <div className="mt-6 flex gap-2">
            <button type="button" className="btn-ink" disabled={!edit.name.trim() || edit.price_cents <= 0} onClick={() => { put({ ...edit, name: edit.name.trim(), benefits: edit.benefits.map((s) => s.trim()).filter(Boolean) }); setEdit(null); }}>Done</button>
            {plans.some((x) => x.id === edit.id) && <button type="button" onClick={() => { setCfg({ ...cfg, memberships: plans.filter((x) => x.id !== edit.id) }); setEdit(null); }} className="h-[52px] shrink-0 rounded-full px-5 text-[14px] font-semibold text-red-600">Delete</button>}
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ───────────────────────── Shop ───────────────────────── */

const KIND_LABEL: Record<MedspaShopItem["kind"], string> = { package: "Package", product: "Skincare", gift_card: "Gift card" };

function ShopSection({ cfg, setCfg, upload }: { cfg: Cfg; setCfg: (c: Cfg) => void; upload: Upload }) {
  const [edit, setEdit] = useState<MedspaShopItem | null>(null);
  const shop = cfg.shop;
  const setShop = (p: Partial<MedspaConfig["shop"]>) => setCfg({ ...cfg, shop: { ...shop, ...p } });
  const put = (it: MedspaShopItem) => setShop({ items: shop.items.some((x) => x.id === it.id) ? shop.items.map((x) => (x.id === it.id ? it : x)) : [...shop.items, it] });
  const blank = (kind: MedspaShopItem["kind"]): MedspaShopItem => ({ id: newId("sh"), kind, name: kind === "gift_card" ? "Gift card" : "", description: "", price_cents: null, member_price_cents: null, image_url: null, treatment_id: null, sessions: kind === "package" ? 3 : null, amounts: kind === "gift_card" ? [5000, 10000, 25000] : [], pickup_note: kind === "product" ? "Ready at the front desk on your next visit." : "", featured: false, is_active: true });
  const unpriced = shop.items.filter((i) => i.is_active && (i.kind === "gift_card" ? i.amounts.length === 0 : !i.price_cents)).length;
  const fin = shop.financing.klarna ? "klarna" : shop.financing.affirm ? "affirm" : "off";
  return (
    <>
      <Panel title="Shop" sub="Packages, skincare and gift cards patients buy in the app. Packages track sessions at the desk; gift cards get a code.">
        <div className="space-y-3">
          <Toggle on={shop.enabled} onChange={(v) => setShop({ enabled: v })} title="Show the Shop" sub="Off = patients only see memberships and treatments" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="How patients pay" hint={shop.pay_mode === "stripe" ? "Card, Apple Pay, Google Pay through your Stripe. Falls back to the desk if Stripe isn't connected." : "Orders are reserved; staff take payment at the desk."}>
              <Segmented value={shop.pay_mode} options={[{ id: "stripe", label: "In the app" }, { id: "in_person", label: "At the desk" }]} onChange={(v) => setShop({ pay_mode: v })} />
            </Field>
            <Field label="Pay over time" hint="Also switch it on in your Stripe dashboard → Payment methods.">
              <Segmented value={fin} options={[{ id: "off", label: "Off" }, { id: "klarna", label: "Klarna" }, { id: "affirm", label: "Affirm" }]} onChange={(v) => setShop({ financing: { klarna: v === "klarna", affirm: v === "affirm" } })} />
            </Field>
          </div>
          <Field label="Line under the Shop title"><Text value={shop.intro} onChange={(v) => setShop({ intro: v })} /></Field>
        </div>
      </Panel>
      <Panel title="Items" sub={unpriced ? `${unpriced} item${unpriced === 1 ? " has" : "s have"} no price yet: patients see "Ask about this" until you add one.` : "Tap an item to edit it."}
        action={<div className="flex gap-2">{(["package", "product", "gift_card"] as const).map((k) => <button key={k} type="button" onClick={() => setEdit(blank(k))} className="h-10 rounded-full bg-page px-4 text-[13.5px] font-semibold">+ {KIND_LABEL[k]}</button>)}</div>}>
        {shop.items.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-line px-6 py-8 text-center">
            <p className="text-[14px] text-sub">No items yet.</p>
            <button type="button" onClick={() => setShop({ items: MEDSPA_STARTER_SHOP.map((s) => ({ ...s, id: newId("sh") })) })} className="mt-3 h-10 rounded-full bg-tint px-5 text-[14px] font-semibold text-brand">Load starter items</button>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line">
            {shop.items.map((it) => <Row key={it.id} img={it.image_url} title={it.name} on={it.is_active} badge={it.featured ? "On Home" : undefined} onClick={() => setEdit({ ...it })} onToggle={(v) => put({ ...it, is_active: v })}
              meta={[KIND_LABEL[it.kind], it.kind === "gift_card" ? it.amounts.map((a) => `$${a / 100}`).join(" / ") || "No amounts" : price(it.price_cents), it.sessions ? `${it.sessions} sessions` : ""].filter(Boolean).join(" · ")} />)}
          </ul>
        )}
      </Panel>
      {edit && (
        <Modal wide title={`${shop.items.some((x) => x.id === edit.id) ? "Edit" : "New"} ${KIND_LABEL[edit.kind].toLowerCase()}`} onClose={() => setEdit(null)}>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-4">
              <Field label="Name"><Text value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} placeholder={edit.kind === "package" ? "HydraFacial, 3 sessions" : "Daily SPF 50"} /></Field>
              <Field label="Description"><Text area value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} /></Field>
            </div>
            <Field label="Photo"><Photo url={edit.image_url} onChange={(u) => setEdit({ ...edit, image_url: u })} upload={upload} folder="medspa/shop" aspect="aspect-square" /></Field>
          </div>
          {edit.kind === "gift_card" ? (
            <div className="mt-4"><Field label="Amounts ($, comma separated)"><Text value={edit.amounts.map((a) => a / 100).join(", ")} onChange={(v) => setEdit({ ...edit, amounts: v.split(",").map((x) => toCents(x)).filter((x): x is number => !!x && x > 0) })} placeholder="50, 100, 250" /></Field></div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Price ($)"><Text value={dollars(edit.price_cents)} onChange={(v) => setEdit({ ...edit, price_cents: toCents(v) })} inputMode="decimal" /></Field>
              <Field label="Member price ($)"><Text value={dollars(edit.member_price_cents)} onChange={(v) => setEdit({ ...edit, member_price_cents: toCents(v) })} inputMode="decimal" placeholder="Same" /></Field>
              {edit.kind === "package" && <Field label="Sessions"><Text value={String(edit.sessions ?? "")} onChange={(v) => setEdit({ ...edit, sessions: parseInt(v.replace(/\D/g, "") || "0", 10) || null })} inputMode="numeric" /></Field>}
            </div>
          )}
          <div className="mt-4 space-y-3">
            {edit.kind === "package" && cfg.treatments.length > 0 && (
              <Field label="Treatment" hint="Lets the desk use a session when it logs this treatment.">
                <select className="field" value={edit.treatment_id ?? ""} onChange={(e) => setEdit({ ...edit, treatment_id: e.target.value || null })}>
                  <option value="">Any treatment</option>{cfg.treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
            {edit.kind === "product" && <Field label="Pickup note"><Text value={edit.pickup_note} onChange={(v) => setEdit({ ...edit, pickup_note: v })} /></Field>}
            <Toggle on={edit.featured} onChange={(v) => setEdit({ ...edit, featured: v })} title="Show on Home" />
          </div>
          <div className="mt-6 flex gap-2">
            <button type="button" className="btn-ink" disabled={!edit.name.trim()} onClick={() => { put({ ...edit, name: edit.name.trim() }); setEdit(null); }}>Done</button>
            {shop.items.some((x) => x.id === edit.id) && <button type="button" onClick={() => { setShop({ items: shop.items.filter((x) => x.id !== edit.id) }); setEdit(null); }} className="h-[52px] shrink-0 rounded-full px-5 text-[14px] font-semibold text-red-600">Delete</button>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ───────────────────────── Booking ───────────────────────── */

function BookingSection({ cfg, setCfg }: { cfg: Cfg; setCfg: (c: Cfg) => void }) {
  const b = cfg.booking;
  const setB = (p: Partial<MedspaConfig["booking"]>) => setCfg({ ...cfg, booking: { ...b, ...p } });
  const linked = cfg.treatments.filter((t) => t.is_active && cleanUrl(t.booking_url)).length;
  const METHODS: { id: BookingMethod; hint: string }[] = [
    { id: "online", hint: "Your booking system" }, { id: "text", hint: "Opens Messages" }, { id: "whatsapp", hint: "Opens WhatsApp" }, { id: "call", hint: "Calls the clinic" },
  ];
  return (
    <Panel title="Booking" sub="Pick the one way patients book. Every Book button in the app, and the booking step after a purchase, uses it.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {METHODS.map(({ id, hint }) => (
          <button key={id} type="button" onClick={() => setB({ method: id })} className={`rounded-[20px] p-4 text-left transition ${b.method === id ? "bg-ink text-white" : "bg-page hover:bg-line/60"}`}>
            <b className="block text-[15px]">{BOOKING_METHOD_LABEL[id]}</b><span className={`text-[13px] ${b.method === id ? "text-white/70" : "text-sub"}`}>{hint}</span>
          </button>
        ))}
      </div>
      {!b.method && <p className="mt-3 text-[13.5px] text-amber-700">Not chosen yet: patients see every option you&apos;ve filled in.</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {(b.method === "online" || !b.method) && <div className="md:col-span-2"><Field label="Booking link" hint={`${linked} treatment${linked === 1 ? " has" : "s have"} their own link (set in Treatments); the rest use this one.`}><Text value={b.default_url} onChange={(v) => setB({ default_url: v })} inputMode="url" placeholder="https://your-booking-site.com" /></Field></div>}
        <Field label="Booking phone" hint="Blank = the clinic phone. Also the fallback if your method isn't set up."><Text value={b.phone} onChange={(v) => setB({ phone: v })} inputMode="tel" /></Field>
        {(b.method === "whatsapp" || !b.method) && <Field label="WhatsApp number" hint="Country code first, digits only."><Text value={b.whatsapp} onChange={(v) => setB({ whatsapp: v })} inputMode="tel" placeholder="18055550142" /></Field>}
        {(b.method === "text" || b.method === "whatsapp" || !b.method) && <div className="md:col-span-2"><Field label="Pre-filled message" hint="{treatment} and {practice} are filled in."><Text value={b.message} onChange={(v) => setB({ message: v })} /></Field></div>}
      </div>
    </Panel>
  );
}
