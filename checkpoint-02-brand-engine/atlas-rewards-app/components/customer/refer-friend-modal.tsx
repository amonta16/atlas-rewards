"use client";
import { useEffect, useState } from "react";
import { X, Copy, Share2, MessageSquare, Mail, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type ReferralRow = {
  id: string; code: string; status: string;
  referee_name: string | null; referee_email: string | null;
  created_at: string; completed_at: string | null;
  // CP-87: qualification progress (friend's spend vs the minimum).
  spend_cents?: number | null; min_spend_cents?: number | null;
};

export function ReferFriendModal({
  business, referralCode, onClose,
}: { business: Business; referralCode: string; onClose: () => void }) {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [copied, setCopied] = useState(false);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const isLocal = rootDomain.includes("lvh.me");
  const shareUrl = `${isLocal ? "http" : "https"}://${business.slug}.${rootDomain}${isLocal ? ":3000" : ""}/signup?ref=${referralCode}`;
  const refReward = business.point_rules.referral_referrer;
  const friendReward = business.point_rules.referral_referee;
  // CP-87: referral points unlock only after the friend spends this much
  // (0 = instant, the old behavior).
  const minSpendCents = business.point_rules.referral_min_spend_cents ?? 2000;

  // Load referrals list + subscribe to realtime updates
  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.rpc("my_referrals", { p_business_id: business.id });
      setReferrals((data ?? []) as ReferralRow[]);
    };
    load();
    const ch = supabase
      .channel(`referrals-${business.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "referrals", filter: `business_id=eq.${business.id}` },
        load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business.id]);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareNative() {
    if (navigator.share) {
      navigator.share({
        title: `Join ${business.name}`,
        text: `Sign up for rewards at ${business.name} — we both get points!`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      copyLink();
    }
  }

  const shareText = encodeURIComponent(`Join me at ${business.name} — sign up for rewards: ${shareUrl}`);
  const smsHref  = `sms:?body=${shareText}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(`Join me at ${business.name}`)}&body=${shareText}`;

  const completedCount = referrals.filter(r => r.status === "completed").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">Refer a friend</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Hero */}
          <div className="text-center">
            <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center"
              style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
              <Users className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-bold mt-3">You both earn</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You get <span className="font-bold" style={{ color: business.brand_colors.primary }}>+{refReward} points</span> and
              your friend gets <span className="font-bold" style={{ color: business.brand_colors.primary }}>+{friendReward} points</span>
              {minSpendCents > 0
                ? <> once they sign up and spend <span className="font-bold" style={{ color: business.brand_colors.primary }}>${(minSpendCents / 100).toFixed(0)}</span>.</>
                : <> when they sign up.</>}
            </p>
          </div>

          {/* Share link card */}
          <div className="mt-6 rounded-2xl border bg-zinc-50 p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Your invite link</div>
            <div className="mt-2 bg-white rounded-lg border p-3 flex items-center gap-2">
              <code className="text-xs flex-1 truncate text-zinc-700">{shareUrl}</code>
              <button onClick={copyLink}
                className="shrink-0 h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5"
                style={{ background: business.brand_colors.primary, color: "white" }}>
                {copied ? <><Check className="h-3 w-3"/>Copied</> : <><Copy className="h-3 w-3"/>Copy</>}
              </button>
            </div>

            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mt-4">Or share via</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ShareTile onClick={shareNative} icon={<Share2 className="h-4 w-4"/>} label="Share" color={business.brand_colors.primary} />
              <ShareTile href={smsHref}        icon={<MessageSquare className="h-4 w-4"/>} label="Text" color={business.brand_colors.primary} />
              <ShareTile href={emailHref}      icon={<Mail className="h-4 w-4"/>} label="Email" color={business.brand_colors.primary} />
            </div>
          </div>

          {/* Stats */}
          {referrals.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-bold mb-2.5">Your referrals · {completedCount} completed</h4>
              <div className="space-y-2">
                {referrals.map(r => {
                  // CP-87: pending referrals show a spend progress bar.
                  const pending = r.status === "pending";
                  const min = r.min_spend_cents ?? minSpendCents;
                  const spent = r.spend_cents ?? 0;
                  const pct = min > 0 ? Math.min(100, Math.round((spent / min) * 100)) : 100;
                  return (
                    <div key={r.id} className="bg-white rounded-xl border p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ background: business.brand_colors.primary }}>
                          {(r.referee_name?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{r.referee_name ?? "Someone"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Joined {new Date(r.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {pending ? (
                          <div className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                            In progress
                          </div>
                        ) : (
                          <div className="text-xs font-bold px-2.5 py-1 rounded-full"
                            style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                            +{refReward}
                          </div>
                        )}
                      </div>
                      {pending && min > 0 && (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 mb-1">
                            <span>They've spent ${(spent / 100).toFixed(2)} of ${(min / 100).toFixed(0)}</span>
                            <span style={{ color: business.brand_colors.primary }}>+{refReward} pts at the finish</span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: business.brand_colors.primary }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareTile({
  onClick, href, icon, label, color,
}: { onClick?: () => void; href?: string; icon: React.ReactNode; label: string; color: string }) {
  const className = "rounded-lg bg-white border p-3 flex flex-col items-center gap-1.5 hover:bg-zinc-50";
  if (href) {
    return (
      <a href={href} className={className}>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, color }}>{icon}</div>
        <span className="text-[11px] font-semibold">{label}</span>
      </a>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      <div className="h-9 w-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15`, color }}>{icon}</div>
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}
