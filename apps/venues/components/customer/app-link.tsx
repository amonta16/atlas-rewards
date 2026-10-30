"use client";
/**
 * AppLink — CP-122
 *
 * Base-aware in-app link for SERVER components. The customer app lives in
 * two URL spaces (CP-45/CP-106): path form `/<slug>/app/...` (native shell
 * on www, agency preview) and subdomain form `/app/...` (PWA). Server
 * components can't run useAppBase, so raw `<a href="/{slug}/app/...">`
 * anchors crept in — full page reloads that also point at the WRONG path
 * on the subdomain form ("lags and glitches, doesn't know where to go").
 *
 * This tiny client wrapper resolves the base at render time and uses a
 * real <Link> (client-side navigation, no reload).
 */
import Link from "next/link";
import { useAppBase } from "@/lib/use-app-base";

export function AppLink({
  slug,
  to,
  className,
  style,
  children,
}: {
  /** Business slug (server components pass params.business). */
  slug: string;
  /** In-app path AFTER the base, e.g. "/rewards" or "/shop". */
  to: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const base = useAppBase(slug);
  return (
    <Link href={`${base}${to}`} className={className} style={style}>
      {children}
    </Link>
  );
}
