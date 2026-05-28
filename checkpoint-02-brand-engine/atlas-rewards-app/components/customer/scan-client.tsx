"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Business, Membership } from "@/lib/types/database";

export function ScanClient({
  business, membership: initialMembership, fullName,
}: { business: Business; membership: Membership | null; fullName: string }) {
  const router = useRouter();
  // CP-24: New users were getting stuck on "Enrolling…" because the layout's
  // enroll_member() call sometimes completes AFTER this page renders (race),
  // or because the row exists but referral_code generation is still in flight.
  // We poll for up to ~10s, calling enroll_member() ourselves (it's
  // idempotent) on each cycle. As soon as a referral_code shows up we stop.
  const [membership, setMembership] = useState<Membership | null>(initialMembership);
  const needsEnroll = !membership?.referral_code;

  useEffect(() => {
    if (!needsEnroll) return;
    let cancelled = false;
    const supabase = createClient();

    let attempts = 0;
    const MAX_ATTEMPTS = 10; // ~10s total
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Idempotent — returns the existing membership if one exists, else creates.
        await supabase.rpc("enroll_member", {
          p_user_id: user.id,
          p_business_id: business.id,
        });
      }
      const { data: memRows } = await supabase.rpc("my_membership", {
        p_business_id: business.id,
      });
      const fresh = (memRows?.[0] ?? null) as Membership | null;
      if (fresh?.referral_code) {
        if (!cancelled) {
          setMembership(fresh);
          // Refresh the server-side data so other tabs pick it up too.
          router.refresh();
        }
        return;
      }
      if (attempts < MAX_ATTEMPTS) setTimeout(tick, 1000);
    };
    tick();
    return () => { cancelled = true; };
  }, [needsEnroll, business.id, router]);

  // Joined date in friendly format
  const joined = membership?.joined_at
    ? new Date(membership.joined_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "today";

  return (
    <div className="p-4 pt-6">
      <div className="text-center mb-4">
        <h1 className="text-lg font-bold">Show this to staff</h1>
        <p className="text-xs text-muted-foreground mt-1">They'll scan it to find your account.</p>
      </div>

      {/* Branded QR card */}
      <div
        className="rounded-3xl p-6 shadow-lg relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
      >
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-15" style={{
          backgroundImage: "radial-gradient(circle at 30% 20%, white 0%, transparent 40%), radial-gradient(circle at 80% 80%, white 0%, transparent 40%)"
        }}/>

        {/* QR */}
        <div className="relative bg-white rounded-2xl p-4 flex items-center justify-center mx-auto" style={{ maxWidth: 240 }}>
          {membership?.referral_code ? (
            <QRCode
              value={membership.referral_code}
              size={200}
              fgColor="#0a0a0a"
              bgColor="#ffffff"
            />
          ) : (
            <div className="h-[200px] w-[200px] flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
              <div className="h-6 w-6 rounded-full border-2 border-zinc-300 border-t-zinc-700 animate-spin" />
              <span>Setting up your QR…</span>
            </div>
          )}
        </div>

        {/* Code printed below QR (so manager can type if camera fails) */}
        {membership?.referral_code && (
          <div className="text-center mt-4">
            <div className="text-white/85 text-[10px] uppercase tracking-widest">Member code</div>
            <div className="text-white font-mono font-bold text-xl tracking-[0.2em] mt-0.5">{membership.referral_code}</div>
          </div>
        )}
      </div>

      {/* Member info card */}
      <div className="mt-4 bg-white rounded-2xl border p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
          style={{ background: business.brand_colors.primary }}>
          {fullName[0]?.toUpperCase() ?? "M"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{fullName}</div>
          <div className="text-[11px] text-zinc-500">Member since {joined}</div>
        </div>
        <div className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
          {membership?.tier ?? "Bronze"}
        </div>
      </div>
    </div>
  );
}
