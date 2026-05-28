"use client";
import { useEffect, useState } from "react";
import { Plus, Zap, Trash2, X, MessageSquare, Mail, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Rule = {
  id: string; name: string;
  trigger: { type: string; value: any };
  action: { channel: string; template: string };
  is_active: boolean;
};

const TRIGGERS = [
  { value: "rule_type:purchase",         label: "Customer makes a purchase" },
  { value: "rule_type:visit",            label: "Customer checks in" },
  { value: "rule_type:review",           label: "Customer leaves a review" },
  { value: "rule_type:birthday",         label: "Customer's birthday" },
  { value: "rule_type:referral_referrer", label: "Customer refers a friend" },
  { value: "rule_type:reactivation",     label: "Dormant customer returns" },
  { value: "balance_above:1000",         label: "Customer balance hits 1,000 pts" },
  { value: "balance_above:5000",         label: "Customer balance hits 5,000 pts" },
];

const CHANNELS = [
  { value: "sms",   label: "SMS",   icon: <MessageSquare className="h-4 w-4" /> },
  { value: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { value: "push",  label: "Push",  icon: <Bell className="h-4 w-4" /> },
];

export function AutomationRulesEditor({ business }: { business: Business }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("automation_rules").select("*")
      .eq("business_id", business.id).order("created_at", { ascending: false });
    setRules((data ?? []) as Rule[]);
  }
  useEffect(() => { load(); }, [business.id]);

  async function save() {
    if (!editing?.name || !editing.trigger || !editing.action) return;
    const supabase = createClient();
    await supabase.rpc("upsert_automation_rule", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_name: editing.name,
      p_trigger: editing.trigger,
      p_action: editing.action,
      p_is_active: editing.is_active ?? true,
    });
    setEditing(null);
    load();
  }

  async function toggleActive(r: Rule) {
    const supabase = createClient();
    await supabase.rpc("upsert_automation_rule", {
      p_id: r.id, p_business_id: business.id, p_name: r.name,
      p_trigger: r.trigger, p_action: r.action, p_is_active: !r.is_active,
    });
    load();
  }

  async function remove(r: Rule) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_automation_rule", { p_id: r.id, p_business_id: business.id });
    load();
  }

  function triggerLabel(t: Rule["trigger"]): string {
    const key = `${t.type}:${t.value}`;
    return TRIGGERS.find(x => x.value === key)?.label ?? `${t.type} = ${t.value}`;
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> Automation rules</h3>
          <p className="text-sm text-muted-foreground mt-1">Send SMS / email / push when something happens.</p>
        </div>
        <Button onClick={() => setEditing({ is_active: true, action: { channel: "sms", template: "" } })}>
          <Plus className="h-4 w-4 mr-1" /> Add rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No automation rules yet. Try: "When customer's balance hits 1000 → SMS them"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="rounded-xl border bg-zinc-50 p-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    When <em>{triggerLabel(r.trigger)}</em> → send {r.action.channel}
                  </div>
                </div>
                <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(r)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit rule" : "New rule"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rule name</Label>
                <Input value={editing.name ?? ""} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="VIP threshold reached" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">When</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editing.trigger ? `${editing.trigger.type}:${editing.trigger.value}` : ""}
                  onChange={e => {
                    const [type, val] = e.target.value.split(":");
                    setEditing({ ...editing, trigger: { type, value: isNaN(parseInt(val)) ? val : parseInt(val) } });
                  }}>
                  <option value="">Choose a trigger…</option>
                  {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Send</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CHANNELS.map(c => {
                    const active = editing.action?.channel === c.value;
                    return (
                      <button key={c.value}
                        onClick={() => setEditing({ ...editing, action: { ...editing.action!, channel: c.value, template: editing.action?.template ?? "" } })}
                        className={`rounded-lg border p-3 flex flex-col items-center gap-1.5 ${
                          active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white"
                        }`}>
                        {c.icon}
                        <span className="text-xs font-semibold">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Message template</Label>
                <Input value={editing.action?.template ?? ""}
                  onChange={e => setEditing({ ...editing, action: { ...editing.action!, template: e.target.value } })}
                  placeholder="Hi {name}, you just hit {balance} points! 🎉" />
                <p className="text-[11px] text-muted-foreground">
                  Use <code>{"{name}"}</code>, <code>{"{balance}"}</code>, <code>{"{delta}"}</code> as placeholders.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Active</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={save}>Save rule</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
