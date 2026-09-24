/**
 * BookCard — CP-147 · Home module "booking"
 *
 * One tappable card that sends the customer to /book. Rendered only when
 * booking is on AND the business has at least one active resource (the
 * page passes `resources`), so it never shows an empty booking screen.
 * Server component — links through AppLink (base-aware, no reload).
 */
import { CalendarClock, ChevronRight } from "lucide-react";
import { AppLink } from "@/components/customer/app-link";
import type { BookingResource } from "@/lib/booking";
import type { Business } from "@/lib/types/database";

export function BookCard({ business, slug, resources }: { business: Business; slug: string; resources: BookingResource[] }) {
  if (resources.length === 0) return null;
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const photo = resources.find(r => r.image_url)?.image_url ?? null;
  // "Batting Cage #1 (softball)", "Batting Cage #2" … → "batting cage".
  const names = [...new Set(resources.map(r => r.name.toLowerCase().replace(/\s*(#|no\.?|number)?\s*\d+.*$/i, "").trim() || r.name.toLowerCase()))].slice(0, 3);
  const what = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} or ${names[1]}` : `${names[0]}, ${names[1]} and more`;
  return (
    <div className="px-4 mt-5">
      <AppLink
        slug={slug}
        to="/book"
        className="block rounded-3xl p-5 text-white shadow-lg relative overflow-hidden active:scale-[0.99] transition"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`, boxShadow: `0 10px 24px -8px ${primary}99` }}
      >
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${primary}ee 0%, ${primary}b3 55%, ${primary}55 100%)` }} />
          </>
        ) : (
          <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/15 blur-2xl pointer-events-none" />
        )}
        <div className="relative flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
            {photo
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={photo} alt="" className="h-full w-full object-cover" />
              : (resources[0].emoji ?? <CalendarClock className="h-6 w-6" />)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-85">Reserve your spot</div>
            <div className="text-lg font-extrabold leading-tight">Book a {what}</div>
            <div className="text-xs opacity-90 mt-0.5">Pick a day and time — it&apos;s ready when you walk in.</div>
          </div>
          <ChevronRight className="h-5 w-5 opacity-90 shrink-0" />
        </div>
      </AppLink>
    </div>
  );
}
