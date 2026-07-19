"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Copy, Check, QrCode, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

/**
 * Business discovery / app QR. Encodes a URL that opens this business's app.
 *
 * CP-43 fix: the QR now uses the LIVE deployment origin verbatim — no
 * subdomain stripping. The old code stripped the leading host label
 * (`acme.atlasrewards.app` → `atlasrewards.app`), which on a Vercel
 * deployment collapsed `my-project.vercel.app` → bare `vercel.app`,
 * producing the dead link `https://vercel.app/qr/burger-king`. The app is
 * served PATH-based on a single domain (`/<slug>`), so the QR targets
 * `<thisOrigin>/qr/<slug>`, and the /qr/<slug> route redirects to `/<slug>`
 * on the same host. Works on *.vercel.app, custom domains, and localhost
 * without any per-business subdomain.
 *
 * Atlas Engine (native) still extracts the slug from the /qr/<slug> path.
 */
export function BusinessDiscoveryQR({ business }: { business: Business }) {
  const [copied, setCopied] = useState(false);
  // SSR placeholder; overwritten with the real origin on mount.
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Use the actual host the agency is viewing from — that's the live,
    // reachable deployment. No stripping, no env guessing.
    setOrigin(window.location.origin);
  }, []);

  // CP-74: QRs now point at the smart landing /j/<join_code>, which serves
  // BOTH worlds — today it forwards browser users into the PWA (/qr/<slug>),
  // and once the store apps ship it shows install badges + the join code.
  // Printed QRs never need reprinting. Falls back to the legacy /qr/<slug>
  // for businesses created before cp74_migration.sql is applied.
  const qrValue = origin
    ? (business.join_code ? `${origin}/j/${business.join_code}` : `${origin}/qr/${business.slug}`)
    : "";
  const looksLikeLocal = /lvh\.me|localhost|127\.0\.0\.1/.test(origin);

  function copyLink() {
    if (!qrValue) return;
    navigator.clipboard.writeText(qrValue);
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
          <h3 className="font-semibold">Your app QR code</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Show this to walk-ins or print it for the counter. Scanning it opens this business's rewards app (and the "Add to Home Screen" prompt). Inside the Atlas Engine app it saves the card to their library.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-center">
        <div
          className="rounded-2xl p-5 flex flex-col items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
        >
          <div className="bg-white rounded-xl p-3">
            {qrValue
              ? <QRCode value={qrValue} size={140} fgColor="#0a0a0a" bgColor="#ffffff" />
              : <div className="h-[140px] w-[140px] animate-pulse bg-zinc-100 rounded" />}
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-sm">Scan to open</div>
            <div className="text-white/85 text-[10px] font-semibold tracking-widest uppercase">{business.name}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-1">App link</div>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-zinc-50 border rounded-md px-3 py-2 truncate">{qrValue || "…"}</code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          {business.join_code && (
            <div>
              <div className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Join code</div>
              <code className="inline-block text-sm font-black tracking-[0.2em] bg-zinc-50 border rounded-md px-3 py-2">{business.join_code}</code>
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Scanning opens the join page for this business — sign-up in the browser today, app-store install once the mobile app launches (same QR, no reprint).</p>
            <p>• Customers can also type the join code on the app's "Join" screen.</p>
            <p>• Print at ~2 inches square. Black on white works best for camera readability.</p>
          </div>
          {looksLikeLocal && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">This QR points to a local-dev URL.</div>
                <div>Phones can't open it. Open this page from your deployed domain (or a phone-reachable URL) and the QR updates automatically.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
