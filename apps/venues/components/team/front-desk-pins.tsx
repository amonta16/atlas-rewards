"use client";
/**
 * FrontDeskPins — CP-49
 *
 * Manager-only panel (Team tab) for the PIN-based front desk. Front-desk
 * staff don't have email logins anymore — a manager gives them a name and
 * a 4-digit PIN here, and they tap it in at /<slug>/frontdesk.
 *
 * Three zones:
 *   1. The shareable keypad link for this business.
 *   2. "Your front desk PIN" — the manager can give themselves a PIN so
 *      they can use the keypad too (they keep their email login as well).
 *   3. The list of front-desk people — add new, change PIN, remove.
 */
import { useCallback, useEffect, useState } from "react";
import {
  KeyRound, Plus, Trash2, RefreshCw, Loader2, Check, Copy,
  ExternalLink, User, Shield, Crown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type DeskRow = {
  user_id: string;
  display_name: string;
  role: "business_staff" | "business_manager" | "agency_admin";
  is_active: boolean;
  is_self: boolean;
  created_at: string;
};

function isValidPin(p: string) { return /^[0-9]{4}$/.test(p); }

export function FrontDeskPins({
  businessId, slug, primary,
}: {
  businessId: string;
  slug: string;
  primary: string;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DeskRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Add-person form
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [adding, setAdding] = useState(false);

  // Manager's own PIN
  const [myPin, setMyPin] = useState("");
  const [savingMine, setSavingMine] = useState(false);

  // Inline change-PIN per row
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPin, setEditPin] = useState("");
  const [copied, setCopied] = useState(false);

  const link = typeof window !== "undefined"
    ? `${window.location.origin}/${slug}/frontdesk`
    : `/${slug}/frontdesk`;

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_front_desk_pins", { p_business_id: businessId });
    setLoading(false);
    if (error) { toast.error("Couldn't load front-desk PINs — " + error.message); return; }
    setRows((data ?? []) as DeskRow[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  async function addPerson() {
    if (!newName.trim()) { toast.error("Enter a name"); return; }
    if (!isValidPin(newPin)) { toast.error("PIN must be 4 digits"); return; }
    setAdding(true);
    const res = await fetch("/api/frontdesk/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: businessId, display_name: newName.trim(), pin: newPin }),
    });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok || !json.ok) { toast.error(json.error ?? "Couldn't add person"); return; }
    toast.success(`${newName.trim()} can now sign in with that PIN`);
    setNewName(""); setNewPin("");
    load();
  }

  async function saveMyPin() {
    if (!isValidPin(myPin)) { toast.error("PIN must be 4 digits"); return; }
    setSavingMine(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_my_front_desk_pin", { p_business_id: businessId, p_pin: myPin });
    setSavingMine(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Your front-desk PIN is set");
    setMyPin("");
    load();
  }

  async function changePin(userId: string, name: string) {
    if (!isValidPin(editPin)) { toast.error("PIN must be 4 digits"); return; }
    const supabase = createClient();
    const { error } = await supabase.rpc("set_front_desk_pin", {
      p_business_id: businessId, p_user_id: userId, p_display_name: name, p_pin: editPin,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`PIN updated for ${name}`);
    setEditingId(null); setEditPin("");
    load();
  }

  async function removePerson(userId: string, name: string) {
    if (!confirm(`Remove ${name}'s front-desk access?`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_front_desk_pin", {
      p_business_id: businessId, p_user_id: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} removed`);
    load();
  }

  function copyLink() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-2xl border bg-white p-6 space-y-6">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4" style={{ color: primary }} /> Front desk PINs
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Front-desk staff sign in with a 4-digit PIN on a branded keypad — no email or password.
          Set people up here, then point the in-store device at the keypad link.
        </p>
      </div>

      {/* Keypad link */}
      <div className="rounded-xl border bg-zinc-50 p-3 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Keypad link</div>
          <div className="text-sm font-mono truncate text-zinc-800">{link}</div>
        </div>
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
        </a>
      </div>

      {/* Manager's own PIN */}
      <div className="rounded-xl border p-3" style={{ borderColor: `${primary}33` }}>
        <Label className="text-xs font-bold text-zinc-700">Your front-desk PIN</Label>
        <p className="text-[11px] text-zinc-500 mt-0.5 mb-2">
          Give yourself a PIN to use the keypad too. You keep your email + password login as well.
        </p>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric" maxLength={4} placeholder="4-digit PIN"
            value={myPin}
            onChange={e => setMyPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="max-w-[140px] tracking-[0.4em] font-bold"
          />
          <Button size="sm" onClick={saveMyPin} disabled={savingMine} style={{ background: primary }}>
            {savingMine ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Set my PIN"}
          </Button>
        </div>
      </div>

      {/* Add a person */}
      <div className="rounded-xl border-2 border-dashed p-3">
        <Label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add front-desk person
        </Label>
        <div className="grid sm:grid-cols-[1fr_140px_auto] gap-2 mt-2">
          <Input placeholder="Name (e.g. Maria)" value={newName} onChange={e => setNewName(e.target.value)} />
          <Input
            inputMode="numeric" maxLength={4} placeholder="4-digit PIN"
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="tracking-[0.4em] font-bold"
          />
          <Button onClick={addPerson} disabled={adding} style={{ background: primary }} className="text-white">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>

      {/* People list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
            People with a PIN
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          </Button>
        </div>

        {loading && !rows && (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-zinc-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {rows && rows.length === 0 && (
          <div className="rounded-xl border-2 border-dashed bg-white p-6 text-center text-sm text-zinc-500">
            No PINs yet — add a front-desk person above.
          </div>
        )}

        <div className="space-y-2">
          {(rows ?? []).map(r => {
            const RoleIcon = r.role === "agency_admin" ? Crown : r.role === "business_manager" ? Shield : User;
            const roleLabel = r.role === "agency_admin" ? "Agency admin" : r.role === "business_manager" ? "Manager" : "Front desk";
            return (
              <div key={r.user_id} className="rounded-xl border bg-white p-3" style={{ borderColor: `${primary}1f` }}>
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                  >
                    {r.display_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {r.display_name}
                      {r.is_self && <span className="ml-1.5 text-[10px] font-bold text-zinc-400">(you)</span>}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                      <RoleIcon className="h-3 w-3" /> {roleLabel}
                    </div>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setEditingId(editingId === r.user_id ? null : r.user_id); setEditPin(""); }}
                  >
                    Change PIN
                  </Button>
                  <Button
                    variant="outline" size="sm" className="text-rose-600"
                    onClick={() => removePerson(r.user_id, r.display_name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {editingId === r.user_id && (
                  <div className="flex items-center gap-2 mt-2 pl-12">
                    <Input
                      inputMode="numeric" maxLength={4} placeholder="New 4-digit PIN" autoFocus
                      value={editPin}
                      onChange={e => setEditPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="max-w-[150px] tracking-[0.4em] font-bold"
                    />
                    <Button size="sm" onClick={() => changePin(r.user_id, r.display_name)} style={{ background: primary }} className="text-white">
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
