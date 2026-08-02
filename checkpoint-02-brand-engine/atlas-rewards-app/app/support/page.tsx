import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { LifeBuoy, Mail, Store, ShieldCheck, FileText, UserX } from "lucide-react";
import { BackLink } from "@/components/back-link";

/**
 * CP-96 — public customer-support page.
 *
 * Serves two jobs at once:
 *   1. The App Store Connect "Support URL" (Apple requires one):
 *      https://www.atlas-engine.app/support
 *   2. The in-app "Help & Support" link on the customer Profile tab.
 *
 * SUPPORT_EMAIL is a Google Workspace ALIAS (free — Admin console →
 * user → Add alternate emails), forwarding to Andrew's inbox. Change it
 * here and in profile-help-links.tsx if the address ever moves.
 */
const SUPPORT_EMAIL = "support@atlas-engine.app";

// CP-96.2: safe-area support inside the notched-iPhone webview (CP-92 pattern).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Support — Atlas Rewards",
  description: "Get help with the Atlas Rewards app — points, rewards, your account, and your data.",
};

const NAVY = "#0a3d62";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* CP-96.1: way back into the app — the native webview has no
                browser chrome, so this is the customer's only exit. */}
            <BackLink />
            <Link href="/" className="font-extrabold tracking-tight" style={{ color: NAVY }}>
              Atlas Engine
            </Link>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/legal/privacy" className="text-zinc-600 hover:text-zinc-900">Privacy</Link>
            <Link href="/legal/terms" className="text-zinc-600 hover:text-zinc-900">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: NAVY }}
          >
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Support</h1>
        </div>
        <p className="text-zinc-600 mb-8">
          Need a hand with the Atlas Rewards app? Start here — most questions are
          answered in seconds.
        </p>

        <div className="space-y-4">
          {/* Points & rewards → the business is the fastest path */}
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <Store className="h-4 w-4" style={{ color: NAVY }} />
              <h2 className="font-bold text-zinc-900">Points, rewards &amp; check-ins</h2>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Your points and rewards are managed by the business you visit. Missing
              points from a purchase, a reward that won&apos;t redeem, or a check-in
              question? The staff at the counter can fix it on the spot — they can
              award, correct, and redeem directly from their dashboard.
            </p>
          </section>

          {/* App problems → email us */}
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <Mail className="h-4 w-4" style={{ color: NAVY }} />
              <h2 className="font-bold text-zinc-900">App issues &amp; everything else</h2>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">
              Trouble signing in, something not loading, notifications misbehaving, or
              any other question about the app itself — email us and we&apos;ll get back
              to you within one business day.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
              style={{ background: NAVY }}
            >
              <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
            </a>
          </section>

          {/* Account & data */}
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <UserX className="h-4 w-4" style={{ color: NAVY }} />
              <h2 className="font-bold text-zinc-900">Your account &amp; your data</h2>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">
              You can update your details or permanently delete your account any time
              from the <strong>Profile</strong> tab inside the app (Delete account lives
              at the bottom). For data questions or requests, email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>{" "}
              — see our{" "}
              <Link href="/legal/privacy" className="underline">Privacy Policy</Link> for
              the details.
            </p>
          </section>

          {/* Legal links */}
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4" style={{ color: NAVY }} />
              <h2 className="font-bold text-zinc-900">The fine print</h2>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/legal/terms" className="inline-flex items-center gap-1.5 text-zinc-700 underline">
                <FileText className="h-3.5 w-3.5" /> Terms of Service
              </Link>
              <Link href="/legal/privacy" className="inline-flex items-center gap-1.5 text-zinc-700 underline">
                <ShieldCheck className="h-3.5 w-3.5" /> Privacy Policy
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t bg-white mt-10" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="max-w-3xl mx-auto px-5 py-6 text-xs text-zinc-500 flex items-center justify-between">
          <span>© {new Date().getFullYear()} Atlas Engine</span>
          <span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
