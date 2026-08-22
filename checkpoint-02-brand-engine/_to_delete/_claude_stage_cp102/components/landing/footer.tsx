import Link from "next/link";
import { ANCHORS, CONTACT_EMAIL, IOS_APP_URL, ANDROID_APP_URL } from "@/lib/landing/config";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[#e8dfd1] py-12" aria-label="Footer">
      <div className="lp-container grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/atlas-engine-logo.png" alt="Atlas Engine" width={1315} height={494} className="h-8 w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
            Branded rewards apps for local businesses. Points, streaks, prize wheels, win-backs and reviews — in your brand.
          </p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="lp-focus mt-4 inline-block rounded text-sm text-slate-700 hover:text-[#14213d]">
            {CONTACT_EMAIL}
          </a>
        </div>
        <Col title="Product" links={[
          { href: `#${ANCHORS.product}`, label: "Overview" },
          { href: `#${ANCHORS.demo}`, label: "Interactive demo" },
          { href: `#${ANCHORS.howItWorks}`, label: "How it works" },
          { href: `#${ANCHORS.pricing}`, label: "Pricing" },
          { href: `#${ANCHORS.waitlist}`, label: "For agencies" },
        ]} />
        <Col title="Customers" links={[
          { href: IOS_APP_URL, label: "AE Rewards on the App Store", ext: true },
          ...(ANDROID_APP_URL ? [{ href: ANDROID_APP_URL, label: "Get it on Google Play", ext: true }] : []),
          { href: "/join", label: "Join a business" },
          { href: "/support", label: "Support" },
        ]} />
        <Col title="Company" links={[
          { href: "/login", label: "Business login" },
          { href: "/legal/terms", label: "Terms" },
          { href: "/legal/privacy", label: "Privacy" },
        ]} />
      </div>
      <div className="lp-container mt-10 flex flex-col gap-2 border-t border-[#e8dfd1] pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>© {year} Atlas Engine. All rights reserved.</span>
        <span>Made for the businesses people visit every week.</span>
      </div>
    </footer>
  );
}

type FooterLink = { href: string; label: string; ext?: boolean };
function Col({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map(({ href, label, ext }) => (
          <li key={href}>
            {ext ? (
              <a href={href} target="_blank" rel="noopener" className="lp-focus rounded text-sm text-slate-700 hover:text-[#14213d]">
                {label}
              </a>
            ) : (
              <Link href={href} className="lp-focus rounded text-sm text-slate-700 hover:text-[#14213d]">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// CP-102: ocean palette pass — tokens + light-surface remaps live in app/globals.css.
