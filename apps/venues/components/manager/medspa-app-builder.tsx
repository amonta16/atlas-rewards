"use client";
/**
 * MedspaAppBuilder — CP-209 · App builder on the MANAGER dashboard (med spas)
 *
 * Until now treatments, the shop, providers, aftercare, the gallery and
 * credits could only be set up by Atlas from the agency builder. This tab
 * gives the practice's managers the same editors (the exact components the
 * agency uses — components/medspa-builder/medspa-studio.tsx), so either side
 * can set the app up. Like Dermis's App Builder.
 *
 * What a manager can NOT change here, on purpose: the layout/niche (locked at
 * creation, also pinned by a DB trigger), brand colors/logo/design (Atlas
 * keeps the app on-brand), billing.
 *
 * Saving writes medspa_config + practice details only (RLS: biz_update_manager).
 * Rewards save themselves (RewardsManager), so that sub-tab has no Save bar.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { Syringe, ShoppingBag, Gift, Stethoscope, HeartHandshake, Images, Wallet, Store, Save, Check, ExternalLink, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readMedspaConfig, type MedspaConfig } from "@/lib/medspa";
import type { Business, ContactInfo } from "@/lib/types/database";
import { AftercareEditor, CreditsEditor, GalleryEditor, ProvidersEditor, ShopEditor, TreatmentsEditor } from "@/components/medspa-builder/medspa-studio";
import { RewardsManager } from "@/components/agency/rewards-manager";

type Sub = "treatments" | "shop" | "rewards" | "providers" | "aftercare" | "gallery" | "credits" | "practice";

const SUBS: { id: Sub; label: string; icon: React.ReactNode }[] = [
  { id: "treatments", label: "Treatments & booking", icon: <Syringe className="h-4 w-4" /> },
  { id: "shop",       label: "Shop",                 icon: <ShoppingBag className="h-4 w-4" /> },
  { id: "rewards",    label: "Rewards",              icon: <Gift className="h-4 w-4" /> },
  { id: "providers",  label: "Providers",            icon: <Stethoscope className="h-4 w-4" /> },
  { id: "aftercare",  label: "Aftercare",            icon: <HeartHandshake className="h-4 w-4" /> },
  { id: "gallery",    label: "Before & after",       icon: <Images className="h-4 w-4" /> },
  { id: "credits",    label: "Member credits",       icon: <Wallet className="h-4 w-4" /> },
  { id: "practice",   label: "Practice info",        icon: <Store className="h-4 w-4" /> },
];

type Practice = { contact_info: ContactInfo; google_review_url: string; welcome_message: string };
const practiceOf = (b: Business): Practice => ({
  contact_info: { ...(b.contact_info ?? {}) },
  google_review_url: b.google_review_url ?? "",
  welcome_message: b.welcome_message ?? "",
});

export function MedspaAppBuilder({ business, onSaved }: { business: Business; onSaved: (next: Business) => void }) {
  const primary = business.brand_colors.primary;
  const [sub, setSub] = useState<Sub>("treatments");
  const [cfg, setCfg] = useState<MedspaConfig>(() => readMedspaConfig(business.medspa_config));
  const [practice, setPractice] = useState<Practice>(() => practiceOf(business));
  const [base, setBase] = useState(() => JSON.stringify([readMedspaConfig(business.medspa_config), practiceOf(business)]));
  const [saving, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify([cfg, practice]) !== base, [cfg, practice, base]);

  // Don't lose a half-built menu to a stray refresh.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function save() {
    setErr(null);
    startSave(async () => {
      const patch = {
        medspa_config: cfg as unknown as Record<string, unknown>,
        contact_info: practice.contact_info,
        google_review_url: practice.google_review_url.trim() || null,
        welcome_message: practice.welcome_message.trim() || null,
      };
      const { error } = await createClient().from("businesses").update(patch).eq("id", business.id);
      if (error) { setErr(error.message); return; }
      setBase(JSON.stringify([cfg, practice]));
      setSavedAt(new Date());
      onSaved({ ...business, ...patch } as Business);
    });
  }

  function discard() {
    const [c, p] = JSON.parse(base) as [MedspaConfig, Practice];
    setCfg(c); setPractice(p);
  }

  const setContact = (p: Partial<ContactInfo>) => setPractice((x) => ({ ...x, contact_info: { ...x.contact_info, ...p } }));

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-zinc-900">App builder</h2>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">Everything your patients see in the app: treatments, booking links, the shop, rewards and your team. Changes go live when you save.</p>
        </div>
        <a href={`/${business.slug}/app`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50">
          View app <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Sub-tabs: filled brand pill = where you are */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="App builder sections">
        {SUBS.map((s) => {
          const on = sub === s.id;
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setSub(s.id)}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition",
                on ? "text-white shadow-md" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50")}
              style={on ? { background: primary } : undefined}>
              {s.icon}{s.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        {sub === "treatments" && <TreatmentsEditor business={business} cfg={cfg} onChange={setCfg} />}
        {sub === "shop"       && <ShopEditor business={business} cfg={cfg} onChange={setCfg} />}
        {sub === "providers"  && <ProvidersEditor business={business} cfg={cfg} onChange={setCfg} />}
        {sub === "aftercare"  && <AftercareEditor business={business} cfg={cfg} onChange={setCfg} />}
        {sub === "gallery"    && <GalleryEditor business={business} cfg={cfg} onChange={setCfg} />}
        {sub === "credits"    && <CreditsEditor business={business} cfg={cfg} onChange={setCfg} />}
        {sub === "rewards" && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">Rewards save as you edit them. Points per action are set by Atlas.</p>
            <RewardsManager business={business} />
          </div>
        )}
        {sub === "practice" && (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm space-y-4 max-w-3xl">
            <div>
              <div className="text-sm font-extrabold text-zinc-900">Practice info</div>
              <p className="text-xs text-zinc-500 mt-0.5">Shown on the app&apos;s home screen and used as the &ldquo;Call us&rdquo; fallback when a treatment has no booking link.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Phone</Label><Input inputMode="tel" value={practice.contact_info.phone ?? ""} onChange={(e) => setContact({ phone: e.target.value })} placeholder="(555) 123-4567" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input inputMode="email" value={practice.contact_info.email ?? ""} onChange={(e) => setContact({ email: e.target.value })} placeholder="hello@yourpractice.com" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={practice.contact_info.address ?? ""} onChange={(e) => setContact({ address: e.target.value })} placeholder="123 Main St, City, ST" /></div>
              <div className="space-y-1.5"><Label>Hours</Label><Input value={practice.contact_info.hours ?? ""} onChange={(e) => setContact({ hours: e.target.value })} placeholder="Tue–Sat 9–6" /></div>
              <div className="space-y-1.5"><Label>Google Maps link</Label><Input inputMode="url" value={practice.contact_info.map_url ?? ""} onChange={(e) => setContact({ map_url: e.target.value })} placeholder="https://maps.google.com/…" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Google review link</Label><Input inputMode="url" value={practice.google_review_url} onChange={(e) => setPractice((x) => ({ ...x, google_review_url: e.target.value }))} placeholder="https://g.page/r/…/review" />
                <p className="text-xs text-muted-foreground">Where &ldquo;Leave a review&rdquo; sends patients (they earn points for it).</p></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Welcome line</Label><Input value={practice.welcome_message} onChange={(e) => setPractice((x) => ({ ...x, welcome_message: e.target.value }))} placeholder="Welcome back! Your care, your rewards, all in one place." /></div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky save bar (not on Rewards, which saves itself) */}
      {sub !== "rewards" && (dirty || savedAt || err) && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+7rem)] w-[min(640px,calc(100vw-2rem))]">
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-2xl">
            <div className="min-w-0 flex-1 text-[13px]">
              {err ? <span className="text-rose-300">Couldn&apos;t save: {err}</span>
                : dirty ? <span className="font-semibold">Unsaved changes</span>
                : <span className="flex items-center gap-1.5 text-emerald-300"><Check className="h-4 w-4" /> Saved — live in the app</span>}
            </div>
            {dirty && <button type="button" onClick={discard} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-white"><Undo2 className="h-3.5 w-3.5" /> Discard</button>}
            {dirty && (
              <Button onClick={save} disabled={saving} className="h-9 rounded-xl text-white" style={{ background: primary }}>
                <Save className="mr-1.5 h-4 w-4" />{saving ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
