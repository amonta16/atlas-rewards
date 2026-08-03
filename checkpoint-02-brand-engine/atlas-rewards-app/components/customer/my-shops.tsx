"use client";
/**
 * MyShops — CP-81
 *
 * The Profile-tab section that makes Atlas feel like ONE account across
 * every participating business:
 *
 *   • Lists every shop this customer belongs to (my_memberships RPC):
 *     logo, name, points balance — current shop pinned with a badge.
 *   • Tapping another shop switches straight into that business's app.
 *     No sign-out, no password: CP-81's parent-domain auth cookie means
 *     the same session is valid on every business subdomain, and the
 *     /app layout auto-enrolls/loads membership on arrival. In the
 *     native shell, NativeShell records the new subdomain as the boot
 *     business automatically on landing.
 *   • "Add another shop" sends them to the neutral /join front door
 *     (?stay=1 so the native cold-start forward doesn't bounce them
 *     back), where they can scan a QR or enter a code. Because they're
 *     still signed in, joining shop #2 is one tap — same email, same
 *     password, one account, many shops.
 */
import { useEffect, useState } from "react";
import { Store, Plus, ChevronRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isNative } from "@/lib/native";

type Shop = {
  business_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  app_icon_url: string | null;
  brand_colors: { primary?: string; secondary?: string } | null;
  points_balance: number;
  tier: string;
  status: string;
  joined_at: string;
};

function rootDomain(): string | null {
  const env = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
  if (env) return env;
  // Fallback: strip the subdomain label off the current host.
  if (typeof window === "undefined") return null;
  const labels = window.location.hostname.split(".");
  return labels.length >= 3 ? labels.slice(1).join(".") : window.location.hostname;
}

export function MyShops({
  currentBusinessId,
  primary,
}: {
  currentBusinessId: string;
  primary: string;
}) {
  const [shops, setShops] = useState<Shop[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("my_memberships");
      if (cancelled) return;
      // RPC missing (migration not run yet) or error → hide the section
      // gracefully rather than breaking the profile page.
      if (error || !Array.isArray(data)) { setShops([]); return; }
      setShops(data as Shop[]);
    })();
    return () => { cancelled = true; };
  }, []);

  function switchTo(shop: Shop) {
    if (shop.business_id === currentBusinessId) return;
    const root = rootDomain();
    if (!root) return;
    // CP-97: the native shell must STAY on the www origin (path routing)
    // — Android only injects the Capacitor plugin bridge on the server
    // origin, so subdomains silently lose push/Preferences. Also rescues
    // devices currently stranded on a subdomain: switching shops brings
    // them back to www. Web browsers keep the subdomain world.
    if (isNative()) {
      window.location.href = `https://www.${root}/${shop.slug}/app`;
      return;
    }
    // Full navigation (not router.push): the destination is another
    // subdomain/origin. NativeShell on arrival records it as the new
    // boot business for the native app.
    window.location.href = `https://${shop.slug}.${root}/app`;
  }

  function addAnother() {
    const root = rootDomain();
    if (!root) return;
    // The apex 301s to www — go straight to the final origin.
    window.location.href = `https://www.${root}/join?stay=1`;
  }

  // Loading, or the migration isn't live yet with no data → render nothing
  // extra beyond the section shell only when we have something to show.
  if (shops === null) return null;

  return (
    <div className="px-4 mt-6">
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Store className="h-4 w-4" style={{ color: primary }} />
          <h3 className="text-sm font-extrabold text-zinc-900">My shops</h3>
        </div>
        <p className="px-4 text-[12px] text-zinc-500 leading-snug">
          One account, every shop — your points and rewards are kept
          separately at each business, and you keep earning at all of them.
        </p>

        <div className="mt-2 divide-y">
          {shops.map((s) => {
            const isCurrent = s.business_id === currentBusinessId;
            const icon = s.app_icon_url || s.logo_url;
            const shopPrimary = s.brand_colors?.primary || primary;
            return (
              <button
                key={s.business_id}
                type="button"
                onClick={() => switchTo(s)}
                disabled={isCurrent}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                  isCurrent ? "bg-zinc-50" : "active:bg-zinc-50"
                }`}
              >
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover shrink-0 ring-1 ring-black/5"
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-extrabold shrink-0"
                    style={{ background: shopPrimary }}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-zinc-900 truncate">{s.name}</div>
                  <div className="text-[12px] text-zinc-500">
                    {s.points_balance.toLocaleString()} points · {s.tier}
                  </div>
                </div>
                {isCurrent ? (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full text-white"
                    style={{ background: shopPrimary }}
                  >
                    <Check className="h-3 w-3" /> Current
                  </span>
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addAnother}
          className="w-full flex items-center gap-3 px-4 py-3.5 border-t text-left active:bg-zinc-50 transition"
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border-2 border-dashed"
            style={{ borderColor: primary, color: primary }}
          >
            <Plus className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold" style={{ color: primary }}>
              Add another shop
            </div>
            <div className="text-[12px] text-zinc-500">
              Scan a QR code or enter a business code — same account, no new password.
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
        </button>
      </div>
    </div>
  );
}
