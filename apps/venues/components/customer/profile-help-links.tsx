/**
 * ProfileHelpLinks — CP-96
 *
 * "Help & legal" card on the customer Profile tab: Support, Terms, and
 * Privacy Policy. Apple's App Review expects the privacy policy to be
 * reachable from INSIDE the app (Guideline 5.1.1), and a visible support
 * path is just good manners — this card is both.
 *
 * Links are RELATIVE (/support, /legal/…) so they work on every host —
 * business subdomains, the apex app host, and inside the native shell's
 * webview (navigation stays in-app; the pages link back home).
 * Server component — no client JS needed.
 */
import { LifeBuoy, FileText, ShieldCheck, ChevronRight } from "lucide-react";

const ROWS = [
  { href: "/support", label: "Help & Support", sub: "Contact us — we reply within a business day", Icon: LifeBuoy },
  { href: "/legal/terms", label: "Terms of Service", sub: "The rules of the rewards program", Icon: FileText },
  { href: "/legal/privacy", label: "Privacy Policy", sub: "What we collect and why", Icon: ShieldCheck },
];

export function ProfileHelpLinks({ primary }: { primary: string }) {
  return (
    <div className="px-4 mt-6">
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <LifeBuoy className="h-4 w-4" style={{ color: primary }} />
          <h3 className="text-sm font-extrabold text-zinc-900">Help &amp; legal</h3>
        </div>
        <div className="divide-y">
          {ROWS.map(({ href, label, sub, Icon }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-3 active:bg-zinc-50 transition"
            >
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${primary}15`, color: primary }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-zinc-900">{label}</div>
                <div className="text-[12px] text-zinc-500 truncate">{sub}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
