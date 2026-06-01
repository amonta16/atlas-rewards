"use client";
/**
 * ManagerTutorial — CP-37.5, visuals added CP-37.7.
 *
 * Step-by-step walkthrough that introduces a manager / front-desk
 * user to their dashboard. Each step now ships with a small inline
 * visual mockup so the user sees exactly which UI element the step
 * describes — Andrew called this out: "add visuals to each step,
 * like screen grabs."
 *
 * The mockups are intentionally low-fidelity (no live data, no real
 * routing) — they're hand-built inline HTML that mirrors the look of
 * the actual component being explained, so they stay in sync with
 * future restyles without scraping screenshots. Each is a self-
 * contained Visual* component below.
 *
 * Role-aware:
 *   • business_staff (front desk) — only the day-to-day ops steps.
 *   • business_manager / agency_admin — also strategic surfaces.
 *
 * Dismissable + remembered per-role in localStorage.
 */
import { useEffect, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, ScanLine, History, DollarSign, Send,
  Tag, BarChart3, Crown, Shield, Sparkles, CreditCard, Newspaper, Flame,
  Bell, Star, Users, AlertCircle, Check, Trophy, QrCode,
} from "lucide-react";

type Role = "agency_admin" | "business_manager" | "business_staff" | null;

type Step = {
  title: string;
  body: string;
  icon: React.ReactNode;
  /** Optional cue: which tab / area the step describes. */
  hint?: string;
  /** Inline visual mockup of the relevant UI. */
  visual: React.ReactNode;
};

function stepsFor(role: Role, primary: string): Step[] {
  const isManager = role === "business_manager" || role === "agency_admin";

  // ── Day-to-day front-desk loop (everyone sees these). ──────────
  const base: Step[] = [
    {
      title: "Scan a customer's QR code",
      body: "Tap the big Scan button (or just point your USB scanner at their phone). The customer's profile + actions open in one tap.",
      icon: <ScanLine className="h-6 w-6" />,
      hint: "Front desk · Scan tile",
      visual: <VisualScanTile primary={primary} />,
    },
    {
      title: "Type a code by hand",
      body: "If the camera won't cooperate, tap \"Type the code\". Member codes are 6 characters, redemption codes are 7. Letters + numbers only.",
      icon: <ScanLine className="h-6 w-6" />,
      hint: "Front desk · Type the code",
      visual: <VisualTypeCode primary={primary} />,
    },
    {
      title: "Check in for streaks",
      body: "Big flame button on the member's profile. Counts toward their streak + fires any milestone reward they crossed.",
      icon: <Flame className="h-6 w-6" />,
      hint: "Member profile · Check in",
      visual: <VisualCheckIn primary={primary} />,
    },
    {
      title: "Award points by purchase",
      body: "Tap the brand-color \"Purchase amount\" tile, punch in the dollar amount on the keypad, hit Award. Points are calculated automatically (e.g. 2 pt per $1).",
      icon: <DollarSign className="h-6 w-6" />,
      hint: "Member profile · Purchase amount",
      visual: <VisualPurchaseAmount primary={primary} />,
    },
    {
      title: "Quick awards (review, referral, etc.)",
      body: "The Quick award buttons cover one-tap reasons — Google review, referral, social follow, birthday. Each gives whatever points the agency configured.",
      icon: <Sparkles className="h-6 w-6" />,
      hint: "Member profile · Quick award",
      visual: <VisualQuickAward primary={primary} />,
    },
    {
      title: "Member history at a glance",
      body: "Below the action buttons you'll see visits, referrals brought in, lifetime points, last visit, and the last 10 transactions. Great for \"who is this person?\" before you award.",
      icon: <History className="h-6 w-6" />,
      hint: "Member profile · Member history",
      visual: <VisualMemberHistory primary={primary} />,
    },
    {
      title: "Pending memberships queue",
      body: "If a customer chose to pay in person, their membership lands here until you confirm payment. Tap Activate when they've handed over the cash / card.",
      icon: <Crown className="h-6 w-6" />,
      hint: "Front desk · Pending memberships",
      visual: <VisualPendingMembership primary={primary} />,
    },
  ];

  // ── Manager / agency-admin-only chapters. ──────────────────────
  const managerExtras: Step[] = [
    {
      title: "Send a one-off notification",
      body: "\"Send to all members\" on the front desk drops an in-app message + push to everyone enrolled. Use it for holiday hours, surprise drops, manual offer announcements.",
      icon: <Send className="h-6 w-6" />,
      hint: "Front desk · Send to all members",
      visual: <VisualBroadcast primary={primary} />,
    },
    {
      title: "Offers (one-time + automated)",
      body: "Offers tab has two sub-tabs. One-time = a single promo card. Automated = templates that fire on signup, birthday, anniversary, inactivity. Each can include a voice memo + image.",
      icon: <Tag className="h-6 w-6" />,
      hint: "Offers tab",
      visual: <VisualOffersTabs primary={primary} />,
    },
    {
      title: "News",
      body: "Short posts that appear under the news feed on every customer's Home tab. Use for shop updates, new products, hours changes.",
      icon: <Newspaper className="h-6 w-6" />,
      hint: "News tab",
      visual: <VisualNewsPost primary={primary} />,
    },
    {
      title: "Insights",
      body: "Atlas Impact dashboard — driven revenue, with/without comparison, Google review funnel. Numbers refresh nightly.",
      icon: <BarChart3 className="h-6 w-6" />,
      hint: "Insights tab",
      visual: <VisualInsights primary={primary} />,
    },
    {
      title: "Billing",
      body: "Agency-level plan status + payments. Front-desk staff never see this tab.",
      icon: <CreditCard className="h-6 w-6" />,
      hint: "Billing tab",
      visual: <VisualBilling primary={primary} />,
    },
    {
      title: "Membership tiers",
      body: "If you sell a paid VIP membership, this tab controls perks, monthly cost, and payment mode (in-person / external link / Stripe).",
      icon: <Crown className="h-6 w-6" />,
      hint: "Membership tab",
      visual: <VisualMembershipTiers primary={primary} />,
    },
    {
      title: "Invite teammates",
      body: "Team tab → \"+ Invite\". You can invite another manager (full access to your business) or front-desk staff (scan + award only, no Billing / Insights). They get a sign-in link by email — no token gymnastics.",
      icon: <Shield className="h-6 w-6" />,
      hint: "Team tab",
      visual: <VisualInviteTeam primary={primary} />,
    },
  ];

  return isManager ? [...base, ...managerExtras] : base;
}

const STORAGE_KEY = "atlas-tutorial-dismissed";

export function ManagerTutorial({
  role,
  primary,
  open,
  onClose,
}: {
  role: Role;
  primary: string;
  open: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const steps = stepsFor(role, primary);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header — brand-colored hero with the step icon. */}
        <div
          className="relative p-5 text-white shrink-0"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)`,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            aria-label="Close tutorial"
          >
            <X className="h-4 w-4 text-white" />
          </button>

          <div className="flex items-center gap-3 pr-10">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center text-white shrink-0">
              {step.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] font-extrabold opacity-90">
                Step {i + 1} of {steps.length}
              </div>
              <div className="text-lg font-extrabold leading-tight">
                {step.title}
              </div>
            </div>
          </div>

          {step.hint && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20 ring-1 ring-white/30">
              <Sparkles className="h-3 w-3" /> {step.hint}
            </div>
          )}
        </div>

        {/* Body — scrolls if the visual + copy are tall. */}
        <div className="p-5 overflow-y-auto">
          {/* CP-37.7: inline visual mockup of the relevant UI element. */}
          <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-3 mb-4 overflow-hidden">
            {step.visual}
          </div>

          <p className="text-sm text-zinc-700 leading-relaxed">{step.body}</p>

          {/* Progress bar */}
          <div className="mt-5 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((i + 1) / steps.length) * 100}%`,
                background: primary,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-between gap-2 bg-zinc-50/60 shrink-0">
          <button
            onClick={() => setI(n => Math.max(0, n - 1))}
            disabled={i === 0}
            className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex-1 flex justify-center gap-1.5">
            {steps.map((_, n) => (
              <span
                key={n}
                className="h-1.5 w-1.5 rounded-full transition"
                style={{ background: n <= i ? primary : "#e4e4e7" }}
              />
            ))}
          </div>
          {!last ? (
            <button
              onClick={() => setI(n => Math.min(steps.length - 1, n + 1))}
              className="inline-flex items-center gap-1 text-white text-sm font-semibold px-3.5 h-9 rounded-lg shadow-sm"
              style={{ background: primary }}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                try { window.localStorage.setItem(STORAGE_KEY + ":" + role, "1"); }
                catch { /* private mode — ignore */ }
                onClose();
              }}
              className="inline-flex items-center gap-1 text-white text-sm font-semibold px-3.5 h-9 rounded-lg shadow-sm"
              style={{ background: primary }}
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook helper — returns whether the tutorial should auto-open on
 * first visit for this role. Persists dismissal in localStorage.
 */
export function useTutorialAutoOpen(role: Role): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!role) return;
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY + ":" + role);
      if (!dismissed) setOpen(true);
    } catch { /* private mode — ignore */ }
  }, [role]);
  return [open, () => setOpen(false)];
}


/* ───────────────────── visual mockups ─────────────────────────
 * Each mockup mirrors the real component's look closely enough to
 * recognize it, while staying low-fidelity so styling drift over
 * time doesn't require regenerating screenshots.
 *
 * All accept the brand `primary` color so they re-skin themselves
 * to whatever business the tutorial is opened in.
 * ──────────────────────────────────────────────────────────────*/

function VisualScanTile({ primary }: { primary: string }) {
  return (
    <div
      className="rounded-2xl p-4 text-white relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-white/25 flex items-center justify-center ring-1 ring-white/40">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-90">Scan</div>
          <div className="font-extrabold leading-tight">Tap to scan a QR</div>
          <div className="text-[11px] opacity-90">or just point your USB scanner</div>
        </div>
        <QrCode className="h-7 w-7 opacity-80" />
      </div>
    </div>
  );
}

function VisualTypeCode({ primary }: { primary: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
        Member or redemption code
      </div>
      <div
        className="rounded-lg px-3 h-12 flex items-center justify-center font-mono tracking-[0.4em] text-xl font-bold border-2"
        style={{ color: primary, borderColor: primary, background: `${primary}08` }}
      >
        A2B3C4D
      </div>
      <div className="text-[10px] text-zinc-500 mt-2 text-center">
        6 chars = member · 7 chars = redemption
      </div>
    </div>
  );
}

function VisualCheckIn({ primary }: { primary: string }) {
  return (
    <div
      className="rounded-2xl p-4 text-white flex items-center gap-3"
      style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
    >
      <div className="h-12 w-12 rounded-xl bg-white/25 flex items-center justify-center ring-1 ring-white/40">
        <Flame className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="font-extrabold leading-tight">Check in</div>
        <div className="text-[11px] opacity-90">Streak: <strong>5</strong> days in a row</div>
      </div>
      <div className="text-3xl font-extrabold tabular-nums">5</div>
    </div>
  );
}

function VisualPurchaseAmount({ primary }: { primary: string }) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl p-3.5 text-white flex items-center gap-3 shadow-sm ring-2 ring-white"
        style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
      >
        <div className="h-10 w-10 rounded-lg bg-white/25 flex items-center justify-center ring-1 ring-white/40">
          <DollarSign className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-extrabold leading-tight">Purchase amount</div>
          <div className="text-[10px] opacity-90">2 pt per $1 spent</div>
        </div>
        <div className="opacity-80 font-bold">→</div>
      </div>
      <div className="text-center text-zinc-500 text-[11px]">tap → keypad</div>
      <div className="rounded-2xl border bg-white p-3 text-center">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Transaction amount</div>
        <div className="text-3xl font-extrabold tabular-nums mt-0.5">
          <span className="text-zinc-400">$</span>15.00
        </div>
        <div className="text-xs mt-0.5">
          <span className="font-bold" style={{ color: primary }}>+30 points</span>
        </div>
      </div>
    </div>
  );
}

function VisualQuickAward({ primary }: { primary: string }) {
  const items: Array<{ label: string; icon: React.ReactNode; tone: string; pts: number }> = [
    { label: "Google Review",  icon: <Star className="h-3.5 w-3.5" />,  tone: "bg-amber-50 text-amber-700",   pts: 25 },
    { label: "Referral",       icon: <Users className="h-3.5 w-3.5" />, tone: "bg-indigo-50 text-indigo-700", pts: 50 },
    { label: "Birthday",       icon: <Sparkles className="h-3.5 w-3.5" />, tone: "bg-rose-50 text-rose-700",  pts: 100 },
    { label: "Social Follow",  icon: <Sparkles className="h-3.5 w-3.5" />, tone: "bg-cyan-50 text-cyan-700",  pts: 10 },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(i => (
        <div key={i.label} className="rounded-xl border bg-white p-2">
          <div className={`h-7 w-7 rounded-md flex items-center justify-center ${i.tone}`}>{i.icon}</div>
          <div className="text-[11px] font-bold mt-1.5">{i.label}</div>
          <div className="text-[10px] font-bold" style={{ color: primary }}>+{i.pts} pts</div>
        </div>
      ))}
    </div>
  );
}

function VisualMemberHistory({ primary }: { primary: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Visits",    value: "47" },
          { label: "Referrals", value: "8" },
          { label: "Lifetime",  value: "12.4k" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-white p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">{s.label}</div>
            <div className="text-base font-extrabold tabular-nums" style={{ color: primary }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-2.5 py-1.5 border-b bg-zinc-50/60 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Recent activity
        </div>
        {[
          { rule: "Purchase",       delta: "+30", time: "Today 3:14p" },
          { rule: "Google review",  delta: "+25", time: "May 28"      },
          { rule: "Visit check-in", delta: "+5",  time: "May 24"      },
        ].map(r => (
          <div key={r.time} className="px-2.5 py-1.5 flex items-center text-[11px] border-b last:border-0">
            <div className="flex-1">
              <div className="font-semibold">{r.rule}</div>
              <div className="text-[9px] text-zinc-500">{r.time}</div>
            </div>
            <div className="font-bold text-emerald-600 tabular-nums">{r.delta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualPendingMembership({ primary }: { primary: string }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-amber-900">
        <div className="font-bold">Sara Q. — VIP membership</div>
        <div className="opacity-90">Chose to pay in person. Confirm $19/mo cash.</div>
      </div>
      <button
        className="text-[11px] font-bold text-white px-2.5 h-7 rounded-md"
        style={{ background: primary }}
      >
        Activate
      </button>
    </div>
  );
}

function VisualBroadcast({ primary }: { primary: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5">
        <Send className="h-3.5 w-3.5 text-rose-500" /> Send to all members
      </div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Title</div>
      <div className="rounded-md border bg-zinc-50 px-2 py-1.5 text-[11px] mt-0.5">
        Surprise drop — $5 off today only ✨
      </div>
      <button
        className="mt-2 w-full text-white text-[11px] font-bold h-8 rounded-md flex items-center justify-center gap-1"
        style={{ background: primary }}
      >
        <Send className="h-3.5 w-3.5" /> Send to everyone
      </button>
    </div>
  );
}

function VisualOffersTabs({ primary }: { primary: string }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <div
          className="text-[11px] font-extrabold px-3 py-1.5 rounded-md text-white"
          style={{ background: primary }}
        >
          One-time
        </div>
        <div className="text-[11px] font-bold px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-600">
          Automated
        </div>
      </div>
      <div className="rounded-xl border bg-white p-2 flex items-center gap-2">
        <div className="h-10 w-10 rounded-md bg-gradient-to-br from-pink-200 to-pink-300" />
        <div className="flex-1">
          <div className="text-[11px] font-bold">10% OFF Tuesday</div>
          <div className="text-[9px] text-zinc-500">Expires today 11:59pm</div>
        </div>
        <Tag className="h-4 w-4 text-zinc-400" />
      </div>
    </div>
  );
}

function VisualNewsPost({ primary }: { primary: string }) {
  return (
    <div className="rounded-xl border bg-white p-2.5">
      <div className="h-16 rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 mb-2 flex items-center justify-center">
        <Newspaper className="h-6 w-6 text-zinc-400" />
      </div>
      <div className="text-[11px] font-bold">New summer flavors are in 🍦</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">Posted today</div>
      <div className="mt-1.5 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${primary}15`, color: primary }}>
        Visible on every customer Home tab
      </div>
    </div>
  );
}

function VisualInsights({ primary }: { primary: string }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl border bg-white p-2.5 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" style={{ color: primary }} />
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Driven revenue</div>
          <div className="text-base font-extrabold tabular-nums" style={{ color: primary }}>$4,820</div>
        </div>
        <div className="text-[10px] text-emerald-600 font-bold">+18%</div>
      </div>
      <div className="grid grid-cols-6 gap-1 h-12 items-end">
        {[40, 55, 35, 70, 60, 85].map((h, i) => (
          <div key={i} className="rounded-t" style={{ height: `${h}%`, background: primary, opacity: 0.6 + i * 0.07 }} />
        ))}
      </div>
    </div>
  );
}

function VisualBilling({ primary }: { primary: string }) {
  return (
    <div className="rounded-xl border bg-white p-3 flex items-center gap-3">
      <CreditCard className="h-7 w-7 shrink-0" style={{ color: primary }} />
      <div className="flex-1">
        <div className="text-[11px] font-extrabold">Pro plan · active</div>
        <div className="text-[10px] text-zinc-500">$49/mo · next billed Jun 30</div>
      </div>
      <Check className="h-4 w-4 text-emerald-500" />
    </div>
  );
}

function VisualMembershipTiers({ primary }: { primary: string }) {
  return (
    <div className="space-y-1.5">
      {[
        { name: "Free",   pts: "0 pts/mo",   tone: "bg-zinc-100 text-zinc-600" },
        { name: "VIP",    pts: "+200 pts/mo", tone: "bg-amber-100 text-amber-700" },
        { name: "Elite",  pts: "+500 pts/mo", tone: "bg-fuchsia-100 text-fuchsia-700" },
      ].map(t => (
        <div key={t.name} className="rounded-lg border bg-white p-2 flex items-center gap-2">
          <Crown className="h-4 w-4" style={{ color: primary }} />
          <div className="flex-1 text-[11px] font-bold">{t.name}</div>
          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.tone}`}>{t.pts}</div>
        </div>
      ))}
    </div>
  );
}

function VisualInviteTeam({ primary }: { primary: string }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl border bg-white p-2.5 flex items-center gap-2">
        <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: primary }}>J</div>
        <div className="flex-1">
          <div className="text-[11px] font-bold">Jordan · manager</div>
          <div className="text-[9px] text-zinc-500">jordan@froyo.com</div>
        </div>
        <Trophy className="h-3.5 w-3.5 text-amber-500" />
      </div>
      <button
        className="w-full rounded-md border-2 border-dashed text-[11px] font-bold py-1.5 flex items-center justify-center gap-1"
        style={{ borderColor: primary, color: primary }}
      >
        <Shield className="h-3.5 w-3.5" /> + Invite teammate
      </button>
    </div>
  );
}
