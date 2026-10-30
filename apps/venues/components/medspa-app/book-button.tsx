"use client";
/**
 * BookButton — CP-207 · "Book" the Dermis way
 *
 * A treatment with a scheduling link (its own, or the practice-wide one)
 * opens that page straight away: the practice's real booking system
 * (Boulevard, Vagaro, Mangomint, Zenoti, Square, Acuity…). No link → the
 * in-app /book screen, which runs Atlas booking when it's on, or offers
 * call / text / WhatsApp with a pre-filled message.
 * Renders nothing when the patient has no way to book at all.
 */
import Link from "next/link";
import { useAppBase } from "@/lib/use-app-base";
import type { BookingOptions } from "@/lib/medspa";

export function BookButton({ slug, treatmentId, options, inApp, className, style, children }: {
  slug: string;
  treatmentId?: string | null;
  options: BookingOptions;
  /** Atlas's own booking is switched on for this business. */
  inApp: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const base = useAppBase(slug);
  if (options.url) {
    return <a href={options.url} target="_blank" rel="noopener noreferrer" className={className} style={style} data-book="link">{children}</a>;
  }
  if (inApp || options.phone || options.whatsapp) {
    return <Link href={`${base}/book${treatmentId ? `?t=${encodeURIComponent(treatmentId)}` : ""}`} className={className} style={style} data-book={inApp ? "app" : "contact"}>{children}</Link>;
  }
  return null;
}
