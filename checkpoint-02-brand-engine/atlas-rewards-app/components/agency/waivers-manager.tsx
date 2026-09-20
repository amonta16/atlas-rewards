"use client";
/**
 * WaiversManager — CP-135 (builder → Waivers tab)
 *
 * Three stacked panels:
 *   1. Waivers — create / rename, required-at-signup, active; publish a new
 *      VERSION (text + optional link to the PDF). Versions are append-only:
 *      publishing never edits what anyone already signed.
 *   2. Signup campaigns — the promotional QR: headline, optional waiver,
 *      optional reward (points or one of the business's offers), and the
 *      link + QR code to print.
 *   3. Submissions — the shared list component (also on the front desk).
 */
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { Plus, FileSignature, Save, X, History, QrCode, Copy, Check, Trash2, Edit2, Gift, ExternalLink, Monitor } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { businessUrl } from "@/lib/utils";
import { WaiverSubmissions } from "@/components/manager/waiver-submissions";
import type { Business } from "@/lib/types/database";

type Waiver = { id: string; title: string; is_active: boolean; required_for_signup: boolean; current_version_id: string | null; created_at: string; kiosk_enabled: boolean };
type Version = { id: string; waiver_id: string; version_no: number; body_text: string; document_url: string | null; created_at: string };
type Campaign = {
  id: string; slug: string; title: string; headline: string; description: string | null;
  waiver_id: string | null; reward_kind: "none" | "points" | "offer"; points_amount: number | null; offer_id: string | null; is_active: boolean;
};
type OfferLite = { id: string; title: string; is_active: boolean; discount_type: string | null };

export function WaiversManager({ business }: { business: Business }) {
  const supabase = useMemo(() => createClient(), []);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [offers, setOffers] = useState<OfferLite[]>([]);
  const [editW, setEditW] = useState<Partial<Waiver> | null>(null);
  const [publishFor, setPublishFor] = useState<Waiver | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftDoc, setDraftDoc] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [editC, setEditC] = useState<Partial<Campaign> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const [w, v, c, o] = await Promise.all([
      supabase.from("business_waivers").select("*").eq("business_id", business.id).order("created_at"),
      supabase.from("waiver_versions").select("id, waiver_id, version_no, body_text, document_url, created_at").eq("business_id", business.id).order("version_no", { ascending: false }),
      supabase.from("signup_campaigns").select("*").eq("business_id", business.id).order("created_at"),
      supabase.from("offers").select("id, title, is_active, discount_type").eq("business_id", business.id).order("created_at", { ascending: false }),
    ]);
    setWaivers((w.data ?? []) as Waiver[]);
    setVersions((v.data ?? []) as Version[]);
    setCampaigns((c.data ?? []) as Campaign[]);
    setOffers(((o.data ?? []) as OfferLite[]).filter(x => x.is_active && x.discount_type !== "points_bonus"));
  }
  useEffect(() => { load(); }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentVersion = (w: Waiver) => versions.find(v => v.id === w.current_version_id) ?? null;

  // CP-142: the address the front-desk tablet opens. Built from the live
  // origin so it is correct in dev, on preview and in production without
  // another env var.
  const kioskUrl = typeof window !== "undefined"
    ? `${window.location.origin.replace(/\/$/, "")}/${business.slug}/kiosk`
    : `/${business.slug}/kiosk`;

  async function saveWaiver() {
    if (!editW?.title) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc("upsert_waiver", {
      p_id: editW.id ?? null, p_business_id: business.id, p_title: editW.title,
      p_is_active: editW.is_active ?? true, p_required_for_signup: editW.required_for_signup ?? false,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const created = !editW.id;
    setEditW(null);
    await load();
    // A brand-new waiver has no text yet — open the publisher right away.
    if (created && data) {
      const w = (await supabase.from("business_waivers").select("*").eq("id", data as string).single()).data as Waiver | null;
      if (w) { setPublishFor(w); setDraftText(""); setDraftDoc(""); }
    }
  }

  async function publish() {
    if (!publishFor) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("publish_waiver_version", {
      p_waiver_id: publishFor.id, p_business_id: business.id, p_body_text: draftText, p_document_url: draftDoc || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPublishFor(null);
    load();
  }

  async function saveCampaign() {
    if (!editC?.headline) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("upsert_signup_campaign", {
      p_id: editC.id ?? null, p_business_id: business.id,
      p_slug: editC.slug || editC.headline, p_title: editC.title || editC.headline, p_headline: editC.headline,
      p_description: editC.description ?? null, p_waiver_id: editC.waiver_id ?? null,
      p_reward_kind: editC.reward_kind ?? "none", p_points_amount: editC.points_amount ?? null,
      p_offer_id: editC.offer_id ?? null, p_is_active: editC.is_active ?? true,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setEditC(null);
    load();
  }

  async function removeCampaign(c: Campaign) {
    if (!confirm(`Delete campaign "${c.title}"? Printed QR codes for it will stop working.`)) return;
    await supabase.rpc("delete_signup_campaign", { p_id: c.id, p_business_id: business.id });
    load();
  }

  function campaignUrl(c: Campaign) {
    const base = business.join_code ? `/j/${business.join_code}` : `/qr/${business.slug}`;
    return businessUrl(rootDomain, { path: `${base}?c=${encodeURIComponent(c.slug)}` });
  }
  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); });
  }

  const textarea = "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      {/* ── 1. Waivers ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4 text-indigo-600" /> Waivers</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The document customers sign in the app. Publishing a change creates a new version — anyone who already signed stays linked to the exact text they signed.
            </p>
          </div>
          <Button onClick={() => setEditW({ is_active: true, required_for_signup: false })}><Plus className="h-4 w-4 mr-1" /> New waiver</Button>
        </div>

        {waivers.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
            <FileSignature className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
            <p className="text-sm">No waivers yet. Create one, paste the text, and attach it to a signup campaign or require it for every new member.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {waivers.map(w => {
              const cv = currentVersion(w);
              const count = versions.filter(v => v.waiver_id === w.id).length;
              return (
                <div key={w.id} className="rounded-xl border bg-zinc-50 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-sm">{w.title}</div>
                        {!w.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">Inactive</span>}
                        {w.required_for_signup && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Required for every new member</span>}
                        {w.kiosk_enabled && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Front-desk kiosk on</span>}
                        {cv ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">v{cv.version_no} live</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">No text published yet</span>
                        )}
                      </div>
                      {cv && <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{cv.body_text}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setPublishFor(w); setDraftText(cv?.body_text ?? ""); setDraftDoc(cv?.document_url ?? ""); }}>
                        {cv ? "New version" : "Publish text"}
                      </Button>
                      {count > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setHistoryFor(historyFor === w.id ? null : w.id)} aria-label="Version history"><History className="h-3 w-3" /></Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEditW(w)} aria-label="Edit"><Edit2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  {/* CP-142: the front-desk tablet. Off by default — a public
                      page serving this business's waiver text only exists once
                      someone deliberately turns it on. */}
                  <div className="mt-3 border-t pt-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                        <Monitor className="h-3 w-3" /> Front-desk kiosk
                      </div>
                      {w.kiosk_enabled ? (
                        <button
                          onClick={() => copy(kioskUrl, `kiosk-${w.id}`)}
                          className="text-[11px] text-sky-700 underline underline-offset-2 truncate max-w-full text-left"
                          title="Copy the kiosk link"
                        >
                          {copied === `kiosk-${w.id}` ? "Copied — open this on the tablet" : kioskUrl}
                        </button>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">
                          {cv ? "Turn on to hand walk-ins a tablet instead of paper." : "Publish text first."}
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={!!w.kiosk_enabled}
                      disabled={!cv}
                      onCheckedChange={async (v) => {
                        setWaivers(ws => ws.map(x => x.id === w.id ? { ...x, kiosk_enabled: v } : x));
                        const { error } = await supabase.rpc("set_waiver_kiosk", {
                          p_id: w.id, p_business_id: business.id, p_enabled: v,
                        });
                        if (error) { setErr(error.message); load(); }
                      }}
                    />
                  </div>
                  {historyFor === w.id && (
                    <div className="mt-3 border-t pt-3 space-y-1.5">
                      {versions.filter(v => v.waiver_id === w.id).map(v => (
                        <div key={v.id} className="text-[11px] flex items-start gap-2">
                          <span className={`font-black shrink-0 ${v.id === w.current_version_id ? "text-emerald-700" : "text-zinc-500"}`}>v{v.version_no}</span>
                          <span className="text-zinc-400 shrink-0">{new Date(v.created_at).toLocaleString()}</span>
                          <span className="text-zinc-600 line-clamp-1">{v.body_text}</span>
                          {v.document_url && <a href={v.document_url} target="_blank" rel="noreferrer" className="text-blue-600 shrink-0"><ExternalLink className="h-3 w-3" /></a>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. Campaigns ───────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><QrCode className="h-4 w-4 text-emerald-600" /> Signup campaigns (promo QR)</h3>
            <p className="text-sm text-muted-foreground mt-1">
              &ldquo;Sign the waiver, get 10% off.&rdquo; Print the QR; customers create an account, sign, and the reward is issued only after every step is recorded.
            </p>
          </div>
          <Button onClick={() => setEditC({ reward_kind: "none", is_active: true, waiver_id: waivers.find(w => w.is_active)?.id ?? null })}><Plus className="h-4 w-4 mr-1" /> New campaign</Button>
        </div>

        {campaigns.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground text-sm">No campaigns yet.</div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(c => {
              const url = campaignUrl(c);
              const w = waivers.find(x => x.id === c.waiver_id);
              const o = offers.find(x => x.id === c.offer_id);
              return (
                <div key={c.id} className="rounded-xl border bg-zinc-50 p-3 flex gap-4">
                  <div className="bg-white p-2 rounded-lg border shrink-0"><QRCode value={url} size={92} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-sm">{c.headline}</div>
                      {!c.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">Off</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {w ? `Waiver: ${w.title}` : "No waiver"} ·{" "}
                      {c.reward_kind === "points" ? `Reward: +${c.points_amount} pts` : c.reward_kind === "offer" ? `Reward: ${o?.title ?? "offer"}` : "No reward"}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-[11px] bg-white border rounded px-2 py-1 truncate max-w-[260px]">{url}</code>
                      <button type="button" onClick={() => copy(url, c.id)} className="text-[11px] font-semibold inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900">
                        {copied === c.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} Copy link
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditC(c)}><Edit2 className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" className="text-rose-600" onClick={() => removeCampaign(c)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Submissions ─────────────────────────────────────────── */}
      <WaiverSubmissions business={business} waivers={waivers.map(w => ({ id: w.id, title: w.title }))} />

      {/* ── modals ─────────────────────────────────────────────────── */}
      {editW && (
        <Modal title={editW.id ? "Edit waiver" : "New waiver"} onClose={() => setEditW(null)}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={editW.title ?? ""} onChange={e => setEditW({ ...editW, title: e.target.value })} placeholder="Liability waiver & release" autoFocus />
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3 cursor-pointer">
              <span className="text-sm">Required for every new member<br /><span className="text-[11px] text-muted-foreground">They&apos;ll be asked to sign the first time they open the app.</span></span>
              <Switch checked={editW.required_for_signup ?? false} onCheckedChange={v => setEditW({ ...editW, required_for_signup: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border p-3 cursor-pointer">
              <span className="text-sm">Active</span>
              <Switch checked={editW.is_active ?? true} onCheckedChange={v => setEditW({ ...editW, is_active: v })} />
            </label>
            {err && <p className="text-sm text-rose-600">{err}</p>}
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="outline" className="flex-1" onClick={() => setEditW(null)}>Cancel</Button>
            <Button className="flex-1" onClick={saveWaiver} disabled={busy || !editW.title}><Save className="h-4 w-4 mr-1" /> {editW.id ? "Save" : "Create & add text"}</Button>
          </div>
        </Modal>
      )}

      {publishFor && (
        <Modal title={`${publishFor.title} — ${currentVersion(publishFor) ? `publish version ${(currentVersion(publishFor)!.version_no) + 1}` : "publish version 1"}`} onClose={() => setPublishFor(null)} wide>
          <p className="text-sm text-muted-foreground">Paste the full waiver text. Customers read it in the app and sign it. Previous versions are kept exactly as signed.</p>
          <textarea value={draftText} onChange={e => setDraftText(e.target.value)} className={`${textarea} mt-3 min-h-[280px] font-mono text-[12px]`} placeholder="WAIVER AND RELEASE OF LIABILITY…" />
          <div className="space-y-1.5 mt-3">
            <Label className="text-xs text-muted-foreground">Link to the PDF / paper form (optional)</Label>
            <Input value={draftDoc} onChange={e => setDraftDoc(e.target.value)} placeholder="https://…/waiver.pdf" />
          </div>
          {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
          <div className="flex gap-2 mt-5">
            <Button variant="outline" className="flex-1" onClick={() => setPublishFor(null)}>Cancel</Button>
            <Button className="flex-1" onClick={publish} disabled={busy || draftText.trim().length < 20}><Save className="h-4 w-4 mr-1" /> Publish</Button>
          </div>
        </Modal>
      )}

      {editC && (
        <Modal title={editC.id ? "Edit campaign" : "New signup campaign"} onClose={() => setEditC(null)}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Headline customers see</Label>
              <Input value={editC.headline ?? ""} onChange={e => setEditC({ ...editC, headline: e.target.value })} placeholder="Sign the waiver, get 10% off today" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Details (optional)</Label>
              <textarea value={editC.description ?? ""} onChange={e => setEditC({ ...editC, description: e.target.value })} className={`${textarea} min-h-[60px]`} placeholder="Valid on your first visit. Show the code at the counter." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Link name</Label>
                <Input value={editC.slug ?? ""} onChange={e => setEditC({ ...editC, slug: e.target.value })} placeholder="welcome-10" />
                <p className="text-[10px] text-muted-foreground">Ends up in the QR link (?c=…).</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Waiver to sign</Label>
                <select value={editC.waiver_id ?? ""} onChange={e => setEditC({ ...editC, waiver_id: e.target.value || null })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">None — account only</option>
                  {waivers.filter(w => w.is_active).map(w => <option key={w.id} value={w.id}>{w.title}{w.current_version_id ? "" : " (no text yet)"}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1"><Gift className="h-3 w-3" /> Reward after signing</div>
              <div className="flex gap-1.5">
                {(["none", "points", "offer"] as const).map(k => (
                  <button key={k} type="button" onClick={() => setEditC({ ...editC, reward_kind: k })}
                    className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border ${editC.reward_kind === k ? "bg-zinc-900 text-white border-zinc-900" : "bg-white"}`}>
                    {k === "none" ? "No reward" : k === "points" ? "Points" : "An offer"}
                  </button>
                ))}
              </div>
              {editC.reward_kind === "points" && (
                <Input type="number" min={1} value={editC.points_amount ?? ""} onChange={e => setEditC({ ...editC, points_amount: parseInt(e.target.value || "0", 10) || null })} placeholder="Points, e.g. 100" />
              )}
              {editC.reward_kind === "offer" && (
                <>
                  <select value={editC.offer_id ?? ""} onChange={e => setEditC({ ...editC, offer_id: e.target.value || null })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Pick an offer…</option>
                    {offers.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                  <p className="text-[10px] text-muted-foreground">Create the &ldquo;10% off&rdquo; offer on the Offers tab first. It lands in the customer&apos;s saved gifts with a code for the counter.</p>
                </>
              )}
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3 cursor-pointer">
              <span className="text-sm">Active</span>
              <Switch checked={editC.is_active ?? true} onCheckedChange={v => setEditC({ ...editC, is_active: v })} />
            </label>
            {err && <p className="text-sm text-rose-600">{err}</p>}
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="outline" className="flex-1" onClick={() => setEditC(null)}>Cancel</Button>
            <Button className="flex-1" onClick={saveCampaign} disabled={busy || !editC.headline}><Save className="h-4 w-4 mr-1" /> Save campaign</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} bg-white rounded-2xl overflow-hidden max-h-[92vh] flex flex-col text-zinc-900`}>
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
