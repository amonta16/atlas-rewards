import Link from "next/link";
import { BackLink } from "@/components/back-link";

/**
 * Shared layout for /legal/* pages. Plain prose, anchored at the root
 * domain only — these pages aren't subdomain-scoped because the same
 * Atlas terms + privacy policy cover every sub-account.
 *
 * CP-96.1: these pages now ALSO serve on business subdomains (middleware
 * passthrough) so the app's Profile-tab links work, and a BackLink
 * returns customers to their app — the native webview has no browser
 * chrome, so without it they'd be stranded here.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackLink />
            <Link href="/" className="font-extrabold tracking-tight" style={{ color: "#0a3d62" }}>
              Atlas Engine
            </Link>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/legal/privacy" className="text-zinc-600 hover:text-zinc-900">Privacy</Link>
            <Link href="/legal/terms"   className="text-zinc-600 hover:text-zinc-900">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-10">{children}</main>
      <footer className="border-t bg-white">
        <div className="max-w-3xl mx-auto px-5 py-6 text-xs text-zinc-500 flex items-center justify-between">
          <span>© {new Date().getFullYear()} Atlas Engine</span>
          <span>Questions? <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a></span>
        </div>
      </footer>
    </div>
  );
}
