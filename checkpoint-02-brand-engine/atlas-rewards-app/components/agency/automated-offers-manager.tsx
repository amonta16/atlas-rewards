"use client";
/**
 * AutomatedOffersManager (CP-29 redesign).
 *
 * Picture-first occasion list, slide-in edit panel that mirrors Andrew's mock:
 *   • Each row has a real holiday image (no flat emoji icon).
 *     Falls back to a brand-gradient + emoji card when no image is on file.
 *   • Right column shows the current discount ("No Discount", "10% off",
 *     "$5 off", "+200 pts") + an Inactive/Active pill + 3-dot menu.
 *   • Edit panel:
 *       - Image + Active toggle row
 *       - Discount section with a "Percentage | Set $ amount" tab toggle
 *       - Voice-message uploader with the "+158%" conversion callout
 *       - Update / Cancel footer
 *     The old product include/exclude block was removed per Andrew's ask.
 *
 * Default holiday art lives in /public/automated-offers/{slug}.png.
 * Filenames are owned by the agency — they can drop images there and the
 * UI picks them up automatically (no DB write needed).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, X, Save, AlertCircle, MoreVertical,
  ChevronLeft, Mic, Pencil, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AudioUploader } from "./audio-uploader";
import { AutomatedOfferPopupPreview } from "./automated-offer-popup-preview";
import type { Business } from "@/lib/types/database";

type Row = {
  template_id: string;
  slug: string;
  name: string;
  emoji: string | null;
  description: string | null;
  default_image_url: string | null;
  trigger_type: "date" | "birthday" | "anniversary" | "signup" | "inactivity";
  trigger_config: Record<string, any>;
  config_id: string | null;
  is_active: boolean;
  custom_title: string | null;
  custom_description: string | null;
  custom_image_url: string | null;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus";
  discount_value: number | null;
  voice_message_url: string | null;
  last_triggered_at: string | null;
};

/** Local discount-type buckets matching the mockup's two-tab toggle. */
type DiscountTab = "percent" | "flat";

/* ───────────────────────── helpers ───────────────────────── */

/**
 * Image resolution order:
 *   1) explicit custom image url
 *   2) default holiday art at /automated-offers/{slug}.png
 *   3) emoji + brand-gradient fallback
 */
function imageFor(row: Row): string | null {
  if (row.custom_image_url) return row.custom_image_url;
  if (row.default_image_url) return row.default_image_url;
  // Convention: drop a PNG in /public/automated-offers/ named after the slug.
  // Replace underscores with hyphens because the filenames in Andrew's brief
  // use the hyphenated form (new-years.png, st-patricks.png …).
  return `/automated-offers/${row.slug.replace(/_/g, "-")}.png`;
}

/** Human-readable content cell: matches "No Discount", "10% off", "$5 off", "+200 pts". */
function discountLabel(row: Row): string {
  if (!row.discount_type || row.discount_type === "none") return "No Discount";
  const v = row.discount_value ?? 0;
  switch (row.discount_type) {
    case "percent":      return `${v}% off`;
    case "flat_cents":   return `$${(v / 100).toFixed(0)} off`;
    case "points_bonus": return `+${v} pts`;
    default:             return "No Discount";
  }
}

/** Friendly summary used in the panel subtitle. */
function triggerSubtitle(row: Row): string {
  const days = row.discount_type === "none" ? 7 : (row.discount_value ? 7 : 7);
  switch (row.trigger_type) {
    case "birthday":
      return `This offer will launch on every app user's birthday. Offer lasts ${days} days`;
    case "anniversary":
      return `This offer will launch on every app user's signup anniversary. Offer lasts ${days} days`;
    case "signup":
      return `This offer will launch the moment a new member signs up. Offer lasts ${days} days`;
    case "inactivity": {
      const d = (row.trigger_config as { days?: number })?.days ?? 14;
      return `This offer will launch when a member hasn't visited in ${d}+ days. Offer lasts ${days} days`;
    }
    case "date":
    default: {
      const cfg = row.trigger_config as { month?: number; day?: number; window_days?: number };
      const monthName = cfg.month
        ? new Date(2000, (cfg.month ?? 1) - 1, 1).toLocaleString(undefined, { month: "long" })
        : "the holiday";
      return `This offer will launch around ${monthName}${cfg.day ? ` ${cfg.day}` : ""}. Offer lasts ${days} days`;
    }
  }
}

/* ──────────────────────── component ──────────────────────── */

export function AutomatedOffersManager({ business }: { business: Business }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  /** Which row's 3-dot menu is open (template_id or null). */
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [savingErr, setSavingErr] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_automated_offers_for_business", {
      p_business_id: business.id,
    });
    if (error) {
      setSavingErr(error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, [business.id]);

  async function toggle(row: Row, next: boolean) {
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_business_automated_offer", {
      p_id: row.config_id ?? null,
      p_business_id: business.id,
      p_template_id: row.template_id,
      p_is_active: next,
      p_custom_title: row.custom_title,
      p_custom_description: row.custom_description,
      p_custom_image_url: row.custom_image_url,
      p_discount_type: row.discount_type ?? "none",
      p_discount_value: row.discount_value,
      p_expires_after_days: 7,
      p_voice_message_url: row.voice_message_url,
    });
    if (error) { setSavingErr(error.message); return; }
    await load();
  }

  async function save() {
    if (!editing) return;
    setSavingErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_business_automated_offer", {
      p_id: editing.config_id ?? null,
      p_business_id: business.id,
      p_template_id: editing.template_id,
      p_is_active: editing.is_active,
      p_custom_title: editing.custom_title,
      p_custom_description: editing.custom_description,
      p_custom_image_url: editing.custom_image_url,
      p_discount_type: editing.discount_type ?? "none",
      p_discount_value: editing.discount_value,
      p_expires_after_days: 7,
      p_voice_message_url: editing.voice_message_url,
    });
    if (error) { setSavingErr(error.message); return; }
    setEditing(null);
    await load();
  }

  async function disable(row: Row) {
    setMenuOpen(null);
    await toggle(row, false);
  }

  /* ───────────────────────── render ───────────────────────── */

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Automated offers
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Set-and-forget seasonal promos. Tap a row to customize the artwork, discount,
            and voice message — then leave it on. The right occasion auto-fires.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 mb-4 flex items-start gap-2 text-[11px] text-blue-900">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          A daily scheduled task calls <code className="font-mono">trigger_automated_offers()</code>.
          Active templates that match today's date publish a featured offer
          (with your voice note attached) in the customer app.
        </div>
      </div>

      {/* Column headers — match Andrew's mock */}
      <div className="grid grid-cols-[1fr_180px_140px_24px] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wider font-bold text-zinc-500">
        <div>Occasion</div>
        <div>Content</div>
        <div />
        <div />
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const img = imageFor(r);
          return (
            <div
              key={r.template_id}
              className="grid grid-cols-[1fr_180px_140px_24px] gap-3 items-center bg-zinc-50/60 hover:bg-zinc-50 transition rounded-xl p-3 border border-transparent hover:border-zinc-200"
            >
              {/* Occasion: thumb + name */}
              <button
                type="button"
                onClick={() => setEditing(r)}
                className="flex items-center gap-3 text-left min-w-0"
              >
                <OccasionThumb row={r} imgUrl={img} brandPrimary={business.brand_colors.primary} />
                <div className="font-semibold text-sm truncate">{r.name}</div>
              </button>

              {/* Content */}
              <div className="text-sm text-zinc-700 truncate">{discountLabel(r)}</div>

              {/* Status pill */}
              <div>
                {r.is_active ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                    <X className="h-3 w-3" /> Inactive
                  </span>
                )}
              </div>

              {/* 3-dot menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === r.template_id ? null : r.template_id); }}
                  className="h-7 w-7 rounded-full hover:bg-zinc-200/70 flex items-center justify-center text-zinc-500"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen === r.template_id && (
                  <>
                    {/* click-outside scrim */}
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(null)} />
                    <div className="absolute right-0 top-8 z-40 w-44 rounded-xl bg-white border shadow-lg py-1 text-sm">
                      <button
                        onClick={() => { setMenuOpen(null); setEditing(r); }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-50 flex items-center gap-2"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => disable(r)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-50 flex items-center gap-2 text-rose-600"
                        disabled={!r.is_active}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Turn off
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
            <p className="text-sm">No templates loaded. Run the CP-18 + CP-29 migrations.</p>
          </div>
        )}
      </div>

      {savingErr && (
        <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-[11px] text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {savingErr}
        </div>
      )}

      {editing && (
        <EditPanel
          row={editing}
          business={business}
          onClose={() => setEditing(null)}
          onChange={(patch) => setEditing({ ...editing, ...patch })}
          onSave={save}
        />
      )}
    </div>
  );
}

/* ───────────────────────── thumb ───────────────────────── */

function OccasionThumb({ row, imgUrl, brandPrimary }: { row: Row; imgUrl: string | null; brandPrimary: string }) {
  const [errored, setErrored] = useState(false);
  // Brand-gradient + emoji fallback when no real image resolves. We trip
  // this either when there's no URL or when the <img> fails to load
  // (e.g. the agency hasn't dropped /public/automated-offers/{slug}.png yet).
  if (!imgUrl || errored) {
    return (
      <div
        className="h-12 w-16 rounded-lg flex items-center justify-center text-2xl shrink-0 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${brandPrimary}22 0%, ${brandPrimary}0a 100%)`,
          border: `1px solid ${brandPrimary}22`,
        }}
      >
        <span>{row.emoji ?? "✨"}</span>
      </div>
    );
  }
  return (
    <div className="h-12 w-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgUrl}
        alt={row.name}
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

/* ───────────────────────── edit panel ───────────────────────── */

function EditPanel({
  row, business, onClose, onChange, onSave,
}: {
  row: Row;
  business: Business;
  onClose: () => void;
  onChange: (patch: Partial<Row>) => void;
  onSave: () => void;
}) {
  const businessId = business.id;
  const brandPrimary = business.brand_colors.primary;
  // Local UI state for the Percentage / Set $ amount tab toggle. We derive
  // the initial tab from the saved discount_type so reopening preserves it.
  const initialTab: DiscountTab = useMemo(() => {
    if (row.discount_type === "flat_cents") return "flat";
    return "percent";
  }, [row.discount_type]);
  const [tab, setTab] = useState<DiscountTab>(initialTab);

  /** Translate the tab + numeric input into discount_type + discount_value. */
  function setDiscount(rawValue: number | null) {
    if (rawValue == null || rawValue === 0) {
      onChange({ discount_type: "none", discount_value: null });
      return;
    }
    if (tab === "percent") {
      onChange({ discount_type: "percent", discount_value: rawValue });
    } else {
      // Tab is "flat" — store cents so the DB matches existing convention.
      onChange({ discount_type: "flat_cents", discount_value: Math.round(rawValue * 100) });
    }
  }

  /** Pretty value to render in the input field, regardless of which tab. */
  const inputValue = (() => {
    if (row.discount_type === "percent") return row.discount_value ?? "";
    if (row.discount_type === "flat_cents") return row.discount_value != null ? (row.discount_value / 100).toFixed(0) : "";
    return "";
  })();

  const inputSuffix = tab === "percent" ? "% off per purchase" : "$ off per purchase";

  const img = imageFor(row);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* scrim */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* slide-in sheet */}
      <div className="w-full sm:w-[480px] bg-white h-full overflow-y-auto shadow-2xl">
        {/* header */}
        <div className="px-5 pt-5 pb-3 flex items-center gap-3">
          <button onClick={onClose} className="h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center" aria-label="Close">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold flex-1">Edit automated offer</h2>
        </div>

        <div className="px-5 pb-32 space-y-5">
          {/* CP-29.1: live popup preview at the top — reflects every edit so
              the agency can see exactly what their customer will see when
              this offer fires. Auto-loops the wrap → reveal → dismiss cycle. */}
          <div className="rounded-2xl bg-zinc-50 py-4">
            <AutomatedOfferPopupPreview
              business={business}
              draft={{
                template_id: row.template_id,
                name: row.name,
                emoji: row.emoji,
                custom_title: row.custom_title,
                custom_description: row.custom_description,
                custom_image_url: row.custom_image_url,
                default_image_url: row.default_image_url,
                slug: row.slug,
                discount_type: row.discount_type,
                discount_value: row.discount_value,
                voice_message_url: row.voice_message_url,
              }}
            />
          </div>

          {/* Title + subtitle */}
          <div>
            <h3 className="text-lg font-extrabold">{row.name}</h3>
            <p className="text-sm text-zinc-500 mt-1 leading-snug">
              {triggerSubtitle(row)}
            </p>
          </div>

          {/* Image + Active toggle row — matches the mock */}
          <div className="flex items-center gap-3">
            <OccasionThumbBig row={row} imgUrl={img} brandPrimary={brandPrimary} />
            <div className="flex-1 rounded-2xl border bg-white p-3 flex items-center justify-between">
              <Label className="cursor-pointer text-sm font-semibold">Active</Label>
              <Switch
                checked={row.is_active}
                onCheckedChange={(v) => onChange({ is_active: v })}
              />
            </div>
          </div>

          {/* Personalize headline/description — optional, collapsed by default
              so the panel stays clean. The popup preview above updates live
              as the agency types so this feels concrete, not abstract. */}
          <details className="rounded-2xl border bg-white p-3 group">
            <summary className="cursor-pointer text-sm font-bold flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5 text-zinc-500" /> Personalize message
              <span className="ml-auto text-[10px] font-normal text-zinc-400">optional</span>
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Headline</Label>
                <Input
                  value={row.custom_title ?? ""}
                  onChange={(e) => onChange({ custom_title: e.target.value })}
                  placeholder="NAME, happy birthday!"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Use <code>NAME</code> as a placeholder for the customer's first name.
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input
                  value={row.custom_description ?? ""}
                  onChange={(e) => onChange({ custom_description: e.target.value })}
                  placeholder="We got you a little gift!"
                />
              </div>
            </div>
          </details>

          {/* Discount section */}
          <section>
            <h3 className="text-base font-extrabold mb-2">Discount</h3>
            {/* Tab toggle: Percentage | Set $ amount */}
            <div className="rounded-full bg-zinc-100 p-1 grid grid-cols-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setTab("percent");
                  // Reinterpret the existing value as a percentage when possible.
                  if (row.discount_type === "flat_cents" && row.discount_value != null) {
                    onChange({ discount_type: "percent", discount_value: Math.round(row.discount_value / 100) });
                  }
                }}
                className={`text-sm font-bold py-2 rounded-full transition ${
                  tab === "percent" ? "bg-white shadow text-zinc-900" : "text-zinc-500"
                }`}
              >
                Percentage
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("flat");
                  if (row.discount_type === "percent" && row.discount_value != null) {
                    onChange({ discount_type: "flat_cents", discount_value: row.discount_value * 100 });
                  }
                }}
                className={`text-sm font-bold py-2 rounded-full transition ${
                  tab === "flat" ? "bg-white shadow text-zinc-900" : "text-zinc-500"
                }`}
              >
                Set $ amount
              </button>
            </div>

            <Label className="text-xs text-muted-foreground">
              {tab === "percent" ? "% amount" : "$ amount"}
            </Label>
            <div className="relative mt-1">
              <Input
                type="number"
                min={0}
                step={tab === "percent" ? 1 : 1}
                value={inputValue}
                onChange={(e) => {
                  const n = e.target.value === "" ? null : parseFloat(e.target.value);
                  setDiscount(Number.isFinite(n as number) ? (n as number) : null);
                }}
                placeholder="0"
                className="pr-36"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                {inputSuffix}
              </span>
            </div>
          </section>

          {/* Voice message section */}
          <section>
            <h3 className="text-base font-extrabold mb-2">Voice message (optional)</h3>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 mb-3 flex items-center gap-2 text-[12px] font-semibold text-emerald-800">
              <Mic className="h-3.5 w-3.5 text-emerald-600" />
              See a +158% boost in conversions using voice notes!
            </div>
            <AudioUploader
              pathPrefix={businessId}
              value={row.voice_message_url}
              onChange={(url) => onChange({ voice_message_url: url })}
            />
          </section>

          {/* CP-29: product include/exclude block intentionally removed. */}
        </div>

        {/* sticky footer */}
        <div className="fixed bottom-0 right-0 w-full sm:w-[480px] border-t bg-white px-5 py-4 flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button onClick={onSave} className="rounded-full px-6 bg-zinc-900 hover:bg-zinc-800 text-white">
            <Save className="h-4 w-4 mr-1.5" /> Update offer
          </Button>
        </div>
      </div>
    </div>
  );
}

function OccasionThumbBig({ row, imgUrl, brandPrimary }: { row: Row; imgUrl: string | null; brandPrimary: string }) {
  const [errored, setErrored] = useState(false);
  if (!imgUrl || errored) {
    return (
      <div
        className="h-16 w-20 rounded-2xl flex items-center justify-center text-3xl shrink-0 overflow-hidden border"
        style={{
          background: `linear-gradient(135deg, ${brandPrimary}22 0%, ${brandPrimary}0a 100%)`,
          borderColor: `${brandPrimary}33`,
        }}
      >
        <span>{row.emoji ?? "✨"}</span>
      </div>
    );
  }
  return (
    <div className="h-16 w-20 rounded-2xl overflow-hidden bg-zinc-100 shrink-0 border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgUrl}
        alt={row.name}
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
