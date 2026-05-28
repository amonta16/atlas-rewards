"use client";
import { useEffect, useState } from "react";
import { Copy, RotateCw, Plus, Trash2, Webhook, ChevronDown, Check, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Endpoint = {
  id: string; url: string; secret: string;
  events: string[]; is_active: boolean; created_at: string;
};

type Delivery = {
  id: string; direction: string; event_type: string; url: string | null;
  status_code: number | null; error: string | null; created_at: string;
};

const EVENT_TYPES = [
  { value: "points.awarded",  label: "Points awarded" },
  { value: "points.redeemed", label: "Points redeemed" },
  { value: "all",             label: "Everything" },
];

export function WebhookSettings({ business: initial }: { business: Business }) {
  const [business, setBusiness] = useState(initial);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["all"]);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const inboundUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/${business.slug}`
    : `http://${rootDomain}:3000/api/webhooks/${business.slug}`;

  async function load() {
    const supabase = createClient();
    const [biz, eps, dlv] = await Promise.all([
      supabase.from("businesses").select("webhook_secret").eq("id", business.id).single(),
      supabase.from("webhook_endpoints").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
      supabase.from("webhook_deliveries").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (biz.data) setSecret(biz.data.webhook_secret);
    setEndpoints((eps.data ?? []) as Endpoint[]);
    setDeliveries((dlv.data ?? []) as Delivery[]);
  }
  useEffect(() => { load(); }, [business.id]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(null), 1500);
  }

  async function rotate() {
    if (!confirm("Rotate the webhook secret? Any external system using the old one will break until updated.")) return;
    setRotating(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("regenerate_webhook_secret", { p_business_id: business.id });
    if (data) setSecret(data as string);
    setRotating(false);
  }

  async function addEndpoint() {
    if (!newUrl) return;
    const supabase = createClient();
    await supabase.rpc("upsert_webhook_endpoint", {
      p_id: null, p_business_id: business.id, p_url: newUrl,
      p_events: newEvents, p_is_active: true,
    });
    setNewUrl(""); setNewEvents(["all"]); setNewOpen(false);
    load();
  }

  async function toggleActive(ep: Endpoint) {
    const supabase = createClient();
    await supabase.rpc("upsert_webhook_endpoint", {
      p_id: ep.id, p_business_id: business.id, p_url: ep.url,
      p_events: ep.events, p_is_active: !ep.is_active,
    });
    load();
  }

  async function removeEndpoint(ep: Endpoint) {
    if (!confirm(`Delete this webhook? ${ep.url}`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_webhook_endpoint", { p_id: ep.id, p_business_id: business.id });
    load();
  }

  return (
    <div className="space-y-6">
      {/* Inbound */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <ArrowDownToLine className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">Inbound webhook</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              POST events from GoHighLevel / Zapier / Make / your POS to this URL to award points automatically.
            </p>
          </div>
        </div>

        <Label className="text-xs text-muted-foreground">URL</Label>
        <div className="mt-1 flex gap-2 items-center">
          <code className="flex-1 text-xs bg-zinc-50 border rounded-md px-3 py-2 truncate">{inboundUrl}</code>
          <Button size="sm" variant="outline" onClick={() => copy(inboundUrl, "url")}>
            {copied === "url" ? <Check className="h-3 w-3"/> : <Copy className="h-3 w-3" />}
          </Button>
        </div>

        <Label className="text-xs text-muted-foreground mt-4 block">Signing secret</Label>
        <div className="mt-1 flex gap-2 items-center">
          <code className="flex-1 text-xs bg-zinc-50 border rounded-md px-3 py-2 truncate font-mono">
            {secret ? `${secret.slice(0, 8)}…${secret.slice(-4)}` : "—"}
          </code>
          {secret && (
            <Button size="sm" variant="outline" onClick={() => copy(secret, "secret")}>
              {copied === "secret" ? <Check className="h-3 w-3"/> : <Copy className="h-3 w-3" />}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={rotate} disabled={rotating}>
            <RotateCw className="h-3 w-3 mr-1" />{rotating ? "Rotating…" : "Rotate"}
          </Button>
        </div>

        <details className="mt-4 rounded-lg border bg-zinc-50 p-3 text-xs">
          <summary className="cursor-pointer font-semibold flex items-center gap-1">
            <ChevronDown className="h-3 w-3" /> Example POST body
          </summary>
          <pre className="mt-3 text-[11px] overflow-x-auto">{`POST ${inboundUrl}
Headers:
  Content-Type: application/json
  X-Atlas-Signature: <hmac-sha256(secret, raw_body) as hex>
Body:
{
  "event_type": "purchase",
  "member": { "email": "customer@example.com" },
  "amount_cents": 4250,
  "idempotency_key": "ghl_txn_abc123"
}`}</pre>
        </details>
      </div>

      {/* Outbound */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <ArrowUpFromLine className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Outbound webhooks</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notify external systems when points happen here.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-3 w-3 mr-1" />Add</Button>
        </div>

        {endpoints.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
            No outbound webhooks configured.
          </div>
        ) : (
          <div className="space-y-2">
            {endpoints.map(ep => (
              <div key={ep.id} className="rounded-lg border bg-zinc-50 p-3">
                <div className="flex items-center gap-3">
                  <Webhook className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ep.url}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ep.events.join(", ")} · {ep.is_active ? "Active" : "Paused"}
                    </div>
                  </div>
                  <Switch checked={ep.is_active} onCheckedChange={() => toggleActive(ep)} />
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => removeEndpoint(ep)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {newOpen && (
          <div className="mt-3 rounded-lg border bg-zinc-50 p-3 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://hooks.zapier.com/..." />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Events</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {EVENT_TYPES.map(et => {
                  const checked = newEvents.includes(et.value);
                  return (
                    <button key={et.value}
                      onClick={() => setNewEvents(checked ? newEvents.filter(e => e !== et.value) : [...newEvents, et.value])}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                        checked ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700"
                      }`}>
                      {et.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={addEndpoint} disabled={!newUrl}>Add webhook</Button>
            </div>
          </div>
        )}
      </div>

      {/* Recent deliveries */}
      <div className="rounded-2xl border bg-white">
        <div className="p-5 border-b">
          <h3 className="font-semibold">Recent deliveries</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Last 20 inbound + outbound events.</p>
        </div>
        <div className="divide-y">
          {deliveries.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No webhook activity yet.</div>
          ) : deliveries.map(d => (
            <div key={d.id} className="px-5 py-3 flex items-center gap-3 text-sm">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                d.direction === "inbound" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
              }`}>
                {d.direction === "inbound" ? "IN" : "OUT"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{d.event_type}</div>
                <div className="text-[11px] text-muted-foreground truncate">{d.url ?? "—"}</div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(d.created_at).toLocaleString()}
              </div>
              {d.error ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">err</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {d.status_code ?? "ok"}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
