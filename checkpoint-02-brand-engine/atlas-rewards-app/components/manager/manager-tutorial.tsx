"use client";
/**
 * ManagerTutorial — CP-37.5
 *
 * Step-by-step walkthrough that introduces a manager / front-desk
 * user to their dashboard. Triggered from the header lightbulb
 * button (mounted in manager-dashboard.tsx).
 *
 * Per Andrew: "so if they ever get confused, they just click and it
 * shows them what their abilities are one by one."
 *
 * The tutorial is role-aware:
 *   • business_staff (front desk) — sees only the day-to-day ops
 *     steps (scanner, check-in, by-transaction, member history).
 *   • business_manager / agency_admin — also sees insights, billing,
 *     team management, offer / news composition.
 *
 * Dismissable + remembered per-role in localStorage so it doesn't
 * pop up forever. Header button is always there if they want to
 * re-open it.
 */
import { useEffect, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, ScanLine, History, DollarSign, Send,
  Tag, BarChart3, Crown, Shield, Sparkles, CreditCard, Newspaper,
} from "lucide-react";

type Role = "agency_admin" | "business_manager" | "business_staff" | null;

type Step = {
  title: string;
  body: string;
  icon: React.ReactNode;
  /** Optional cue: which tab / area the step describes. */
  hint?: string;
};

function stepsFor(role: Role): Step[] {
  const isManager = role === "business_manager" || role === "agency_admin";

  // Steps every role sees — the day-to-day front-desk loop.
  const base: Step[] = [
    {
      title: "Scan a customer's QR code",
      body: "Tap the big Scan button (or just point your USB scanner at their phone). The customer's profile + actions open in one tap.",
      icon: <ScanLine className="h-6 w-6" />,
      hint: "Front desk · Scan tile",
    },
    {
      title: "Type a code by hand",
      body: "If the camera won't cooperate, tap \"Type the code\". Member codes are 6 characters, redemption codes are 7. Letters + numbers only.",
      icon: <ScanLine className="h-6 w-6" />,
      hint: "Front desk · Type the code",
    },
    {
      title: "Check in for streaks",
      body: "Big flame button on the member's profile. Counts toward their streak + fires any milestone reward they crossed.",
      icon: <Sparkles className="h-6 w-6" />,
      hint: "Member profile · Check in",
    },
    {
      title: "Award points by purchase",
      body: "Tap the brand-color \"Purchase amount\" tile, punch in the dollar amount on the keypad, hit Award. Points are calculated automatically (e.g. 2 pt per $1).",
      icon: <DollarSign className="h-6 w-6" />,
      hint: "Member profile · Purchase amount",
    },
    {
      title: "Quick awards (review, referral, etc.)",
      body: "The Quick award buttons cover one-tap reasons — Google review, referral, social follow, birthday. Each gives whatever points the agency configured.",
      icon: <Sparkles className="h-6 w-6" />,
      hint: "Member profile · Quick award",
    },
    {
      title: "Member history at a glance",
      body: "Below the action buttons you'll see visits, referrals brought in, lifetime points, last visit, and the last 10 transactions. Great for \"who is this person?\" before you award.",
      icon: <History className="h-6 w-6" />,
      hint: "Member profile · Member history",
    },
    {
      title: "Pending memberships queue",
      body: "If a customer chose to pay in person, their membership lands here until you confirm payment. Tap Activate when they've handed over the cash / card.",
      icon: <Crown className="h-6 w-6" />,
      hint: "Front desk · Pending memberships",
    },
  ];

  // Manager-only chapters — strategic surfaces.
  const managerExtras: Step[] = [
    {
      title: "Send a one-off notification",
      body: "\"Send to all members\" on the front desk drops an in-app message + push to everyone enrolled. Use it for holiday hours, surprise drops, manual offer announcements.",
      icon: <Send className="h-6 w-6" />,
      hint: "Front desk · Send to all members",
    },
    {
      title: "Offers (one-time + automated)",
      body: "Offers tab has two sub-tabs. One-time = a single promo card. Automated = templates that fire on signup, birthday, anniversary, inactivity. Each can include a voice memo + image.",
      icon: <Tag className="h-6 w-6" />,
      hint: "Offers tab",
    },
    {
      title: "News",
      body: "Short posts that appear under the news feed on every customer's Home tab. Use for shop updates, new products, hours changes.",
      icon: <Newspaper className="h-6 w-6" />,
      hint: "News tab",
    },
    {
      title: "Insights",
      body: "Atlas Impact dashboard — driven revenue, with/without comparison, Google review funnel. Numbers refresh nightly.",
      icon: <BarChart3 className="h-6 w-6" />,
      hint: "Insights tab",
    },
    {
      title: "Billing",
      body: "Agency-level plan status + payments. Front-desk staff never see this tab.",
      icon: <CreditCard className="h-6 w-6" />,
      hint: "Billing tab",
    },
    {
      title: "Membership tiers",
      body: "If you sell a paid VIP membership, this tab controls perks, monthly cost, and payment mode (in-person / external link / Stripe).",
      icon: <Crown className="h-6 w-6" />,
      hint: "Membership tab",
    },
    {
      title: "Invite teammates",
      body: "Team tab → \"+ Invite\". You can invite another manager (full access to your business) or front-desk staff (scan + award only, no Billing / Insights). They get a sign-in link by email — no token gymnastics.",
      icon: <Shield className="h-6 w-6" />,
      hint: "Team tab",
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
  const steps = stepsFor(role);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
        {/* Header — brand-colored hero with the step icon. */}
        <div
          className="relative p-5 text-white"
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

          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center text-white">
              {step.icon}
            </div>
            <div>
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

        {/* Body */}
        <div className="p-5">
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
        <div className="px-5 py-4 border-t flex items-center justify-between gap-2 bg-zinc-50/60">
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
