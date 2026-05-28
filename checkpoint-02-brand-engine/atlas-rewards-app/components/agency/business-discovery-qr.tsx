"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Download, Copy, Check, QrCode, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

/**
 * Business discovery QR. Encodes a URL that the Atlas Engine native app
 * recognizes and uses to add this business to the customer's library.
 *
 * Resolution order for the host:
 *   1. NEXT_PUBLIC_ROOT_DOMAIN  (most reliable in production)
 *   2. window.location.origin    (runtime fallback when env wasn't set)
 *   3. "lvh.me:3000"             (local dev default — phones cannot reach this)
 *
 * Format: https://<ROOT>/qr/<slug>
 * Atlas Engine extracts the slug from the path.
 */
export function BusinessDiscoveryQR({ business }: { business: Business }) {
  const [copied, setCopied] = useState(false);
  const envDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  const [origin, setOrigin] = useState<string>(() => {
    // First pass (SSR / initial render): use env if present, else placeholder.
    if (envDomain && !envDomain.includes("lvh.me")) {
      return `https://${envDomain}`;
    }
    if (envDomain.includes("lvh.me")) {
      return `http://${envDomain}:3000`;
    }
    return "https://example.com"; // overwritten on mount
  });

  // After mount, prefer the live origin (handles "env wasn't set in prod").
  useEffect(() => {
    if (typeof window === "undefined") return;
    const live = window.location.origin;
    // Strip any subdomain the agency might be on so the QR encodes the apex.
    // e.g. https://acme.atlasrewards.app  →  https://atlasrewards.app
    try {
      const u = new URL(live);
      const host = u.host;
      // We only strip a single leading sub-label when there's at least three labels
      // (so atlasrewards.app stays untouched but app.atlasrewards.app collapses).
      const parts = host.split(".");
      const trimmed = parts.length > 2 ? parts.slice(1).join(".") : host;
      setOrigin(`${u.protocol}//${trimmed}`);
    } catch {
      setOrigin(live);
    }
  }, []);

  const qrValue   = `${origin}/qr/${business.slug}`;
  const printValue = qrValue;
  const looksLikeLocal = /lvh\.me|localhost|127\.0\.0\.1/.test(origin);

  function copyLink() {
    navigator.clipboard.writeText(printValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
          <QrCode className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">Atlas Engine discovery QR</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Print this and stick it on your front window or counter. Customers using the Atlas Engine app scan it once to save your rewards card to their phone library.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-center">
        <div
          className="rounded-2xl p-5 flex flex-col items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
        >
          <div className="bg-white rounded-xl p-3">
            <QRCode value={qrValue} size={140} fgColor="#0a0a0a" bgColor="#ffffff" />
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-sm">Scan with</div>
            <div className="text-white/85 text-[10px] font-semibold tracking-widest uppercase">Atlas Engine</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-1">URL encoded</div>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-zinc-50 border rounded-md px-3 py-2 truncate">{qrValue}</code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Inside Atlas Engine: tapped/scanned → adds your business to the customer's library.</p>
            <p>• Outside Atlas Engine: opens the customer-facing landing page (and the "Add to Home Screen" PWA prompt).</p>
            <p>• Print at ~2 inches square. Black on white works best for camera readability.</p>
          </div>
          {looksLikeLocal && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">This QR points to a local-dev URL.</div>
                <div>Phones won't be able to open it. Deploy to a real domain or set <code>NEXT_PUBLIC_ROOT_DOMAIN</code> in your env (e.g. <code>atlasrewards.app</code>) and reprint.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
