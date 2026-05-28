"use client";
import { Plus, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Business, Service } from "@/lib/types/database";

/**
 * Products / Services editor — writes back to businesses.services (jsonb).
 * The customer app's Shop tab reads from the same array. Live preview
 * updates as soon as the parent's state changes.
 */
export function ProductsManager({
  business,
  onUpdate,
}: {
  business: Business;
  onUpdate: (patch: Partial<Business>) => void;
}) {
  const services = business.services ?? [];

  function updateService(i: number, patch: Partial<Service>) {
    const next = services.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onUpdate({ services: next });
  }

  function addService() {
    onUpdate({
      services: [...services, { name: "New product", category: "", price_cents: 0 }],
    });
  }

  function removeService(i: number) {
    onUpdate({ services: services.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-violet-600" /> Products &amp; services
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Anything you sell or offer. Appears in the customer app's Shop tab.
          </p>
        </div>
        <Button onClick={addService}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      {services.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No products yet. Add at least one to populate the Shop tab.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((s, i) => (
            <div key={i} className="rounded-xl border bg-zinc-50 p-3">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input value={s.name} onChange={e => updateService(i, { name: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Input value={s.category ?? ""} onChange={e => updateService(i, { category: e.target.value })}
                    placeholder="Service / Drink / Class…" />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs text-muted-foreground">Price (USD)</Label>
                  <Input type="number" min={0} step="0.01"
                    value={s.price_cents ? (s.price_cents / 100).toFixed(2) : ""}
                    onChange={e => updateService(i, { price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => removeService(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Tip: managers see the same editor in their front-desk dashboard so they can keep prices fresh without bothering the agency.
      </p>
    </div>
  );
}
