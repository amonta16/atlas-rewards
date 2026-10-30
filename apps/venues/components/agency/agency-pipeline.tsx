"use client";
/**
 * AgencyPipeline — CP-50
 *
 * A lightweight CRM for prospects that aren't Atlas businesses yet. Leads
 * move through stages (Lead → Contacted → In talks → Proposal → Won/Lost).
 * Agency-admin only (RLS on agency_pipeline). Feeds the dashboard funnel.
 *
 * A "Won" prospect can be converted into a real sub-account — that opens
 * the New Business modal prefilled with the prospect's name.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Plus, Trash2, Loader2, GripVertical, Phone, StickyNote, Pencil, Check, X, Rocket,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { NewBusinessModal } from "./new-business-modal";

type Stage = "lead" | "contacted" | "in_talks" | "proposal" | "won" | "lost";
type Row = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_info: string | null;
  stage: Stage;
  est_monthly_cents: number;
  notes: string | null;
  created_at: string;
};

const STAGES: { key: Stage; label: string; tint: string }[] = [
  { key: "lead",      label: "Leads",     tint: "#64748b" },
  { key: "contacted", label: "Contacted", tint: "#38bdf8" },
  { key: "in_talks",  label: "In talks",  tint: "#22d3ee" },
  { key: "proposal",  label: "Proposal",  tint: "#a78bfa" },
  { key: "won",       label: "Won",       tint: "#34d399" },
  { key: "lost",      label: "Lost",      tint: "#fb7185" },
];

const dollars = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function AgencyPipeline() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [convertName, setConvertName] = useState<string | null>(null);

  // Add form
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("agency_pipeline").select("*").order("created_at", { ascending: false });
    if (error) { toast.error("Couldn't load pipeline — " + error.message); return; }
    setRows((data ?? []) as Row[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addLead() {
    if (!newName.trim()) { toast.error("Name the prospect first"); return; }
    setAdding(true);
    const supabase = createClient();
    const cents = newValue ? Math.round(parseFloat(newValue) * 100) : 0;
    const { error } = await supabase.from("agency_pipeline").insert({
      name: newName.trim(),
      contact_info: newContact.trim() || null,
      est_monthly_cents: Number.isFinite(cents) ? cents : 0,
      stage: "lead",
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setNewName(""); setNewContact(""); setNewValue("");
    load();
  }

  async function move(id: string, stage: Stage) {
    const supabase = createClient();
    setRows(prev => prev?.map(r => r.id === id ? { ...r, stage } : r) ?? prev); // optimistic
    const { error } = await supabase.from("agency_pipeline").update({ stage }).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} from the pipeline?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("agency_pipeline").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev?.filter(r => r.id !== id) ?? prev);
  }

  function startEdit(r: Row) {
    setEditId(r.id);
    setDraft({ name: r.name, contact_info: r.contact_info, est_monthly_cents: r.est_monthly_cents, notes: r.notes });
  }
  async function saveEdit(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("agency_pipeline").update({
      name: (draft.name ?? "").toString().trim() || "Untitled",
      contact_info: draft.contact_info ?? null,
      est_monthly_cents: draft.est_monthly_cents ?? 0,
      notes: draft.notes ?? null,
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditId(null); setDraft({});
    load();
  }

  const totalOpen = (rows ?? []).filter(r => r.stage !== "won" && r.stage !== "lost")
    .reduce((s, r) => s + r.est_monthly_cents, 0);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #061a32 0%, #04132a 50%, #020c1c 100%)" }}>
      <header className="relative px-8 pt-10 pb-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-20 right-16 h-56 w-56 rounded-full blur-3xl opacity-25" style={{ background: "#22d3ee" }} />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · Pipeline</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1">Prospect pipeline</h1>
          <p className="text-sm text-sky-200/60 mt-1">
            Track who you're reaching out to and who's in talks. {dollars(totalOpen)}/mo in open pipeline.
          </p>
        </div>
      </header>

      {/* Add a lead */}
      <div className="px-8">
        <div className="rounded-2xl p-3 flex flex-col sm:flex-row gap-2"
          style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.16)" }}>
          <Input placeholder="Business / prospect name" value={newName} onChange={e => setNewName(e.target.value)}
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-sky-200/30" />
          <Input placeholder="Contact (phone / email)" value={newContact} onChange={e => setNewContact(e.target.value)}
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-sky-200/30" />
          <div className="relative sm:w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
            <Input placeholder="Est /mo" value={newValue} inputMode="numeric"
              onChange={e => setNewValue(e.target.value.replace(/[^0-9.]/g, ""))}
              className="pl-6 bg-white/5 border-white/10 text-white placeholder:text-sky-200/30" />
          </div>
          <Button onClick={addLead} disabled={adding} className="bg-sky-400 text-slate-900 hover:bg-sky-300 font-semibold">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add lead</>}
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="px-8 py-6 overflow-x-auto">
        {rows === null ? (
          <div className="text-sky-200/50 flex items-center gap-2 py-10"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="flex gap-4 min-w-max">
            {STAGES.map(col => {
              const items = rows.filter(r => r.stage === col.key);
              const colValue = items.reduce((s, r) => s + r.est_monthly_cents, 0);
              return (
                <div key={col.key} className="w-72 shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.tint, boxShadow: `0 0 8px ${col.tint}` }} />
                      <span className="text-sm font-bold text-white">{col.label}</span>
                      <span className="text-[11px] text-sky-200/40">{items.length}</span>
                    </div>
                    {colValue > 0 && <span className="text-[11px] text-sky-200/50 tabular-nums">{dollars(colValue)}/mo</span>}
                  </div>

                  <div className="space-y-2 rounded-2xl p-2 min-h-[120px]"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {items.length === 0 && (
                      <div className="text-[12px] text-sky-200/30 text-center py-6">Empty</div>
                    )}
                    {items.map(r => (
                      <div key={r.id} className="rounded-xl p-3"
                        style={{ background: "rgba(2,12,28,0.6)", border: `1px solid ${col.tint}33` }}>
                        {editId === r.id ? (
                          <div className="space-y-2">
                            <Input value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                              className="h-8 bg-white/5 border-white/10 text-white text-sm" placeholder="Name" />
                            <Input value={draft.contact_info ?? ""} onChange={e => setDraft(d => ({ ...d, contact_info: e.target.value }))}
                              className="h-8 bg-white/5 border-white/10 text-white text-sm" placeholder="Contact" />
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-200/40 text-xs">$</span>
                              <Input value={draft.est_monthly_cents != null ? (draft.est_monthly_cents / 100).toString() : ""}
                                inputMode="numeric"
                                onChange={e => setDraft(d => ({ ...d, est_monthly_cents: Math.round((parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0) * 100) }))}
                                className="h-8 pl-5 bg-white/5 border-white/10 text-white text-sm" placeholder="Est /mo" />
                            </div>
                            <textarea value={draft.notes ?? ""} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                              className="w-full rounded-md bg-white/5 border border-white/10 text-white text-sm p-2 min-h-[48px]" placeholder="Notes" />
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => saveEdit(r.id)} className="bg-sky-400 text-slate-900 hover:bg-sky-300 h-7">
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setDraft({}); }} className="text-sky-200/60 h-7">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-white text-sm leading-tight">{r.name}</div>
                              <GripVertical className="h-3.5 w-3.5 text-sky-200/20 shrink-0 mt-0.5" />
                            </div>
                            {r.est_monthly_cents > 0 && (
                              <div className="text-[12px] font-bold text-sky-300 tabular-nums mt-0.5">{dollars(r.est_monthly_cents)}/mo</div>
                            )}
                            {r.contact_info && (
                              <div className="text-[11px] text-sky-200/50 mt-1 flex items-center gap-1 truncate">
                                <Phone className="h-3 w-3 shrink-0" /> {r.contact_info}
                              </div>
                            )}
                            {r.notes && (
                              <div className="text-[11px] text-sky-200/40 mt-1 flex items-start gap-1">
                                <StickyNote className="h-3 w-3 shrink-0 mt-0.5" /> <span className="line-clamp-2">{r.notes}</span>
                              </div>
                            )}

                            {/* Stage move + actions */}
                            <div className="flex items-center gap-1.5 mt-2.5">
                              <select value={r.stage} onChange={e => move(r.id, e.target.value as Stage)}
                                className="flex-1 h-7 rounded-md bg-white/5 border border-white/10 text-[11px] text-sky-100 px-1.5">
                                {STAGES.map(s => <option key={s.key} value={s.key} className="bg-slate-800">{s.label}</option>)}
                              </select>
                              <button onClick={() => startEdit(r)} className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => remove(r.id, r.name)} className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300" title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {r.stage === "won" && (
                              <Button size="sm" onClick={() => setConvertName(r.name)}
                                className="w-full mt-2 h-7 bg-emerald-500/90 hover:bg-emerald-400 text-slate-900 font-semibold text-[12px]">
                                <Rocket className="h-3.5 w-3.5 mr-1" /> Create business
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {convertName !== null && (
        <NewBusinessModal initialName={convertName} onClose={() => { setConvertName(null); load(); }} />
      )}
    </div>
  );
}
