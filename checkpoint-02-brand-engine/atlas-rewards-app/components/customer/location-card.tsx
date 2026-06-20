/**
 * LocationCard — CP-52.6
 *
 * Map + address + "Call now" card at the bottom of the customer home.
 * Enabled per-business via widget_config.location; the agency pastes a
 * Google Maps link + phone in the brand editor (Design → Location).
 *
 * The embedded map uses Google's no-API-key `&output=embed` form built
 * from the business address, so it works without a Maps API key. The
 * pasted map link is used for "Get directions" when tapped.
 */
import { MapPin, Clock, Phone, ExternalLink } from "lucide-react";
import type { Business } from "@/lib/types/database";

export function LocationCard({ business }: { business: Business }) {
  const c = business.contact_info ?? {};
  const phone = (c.phone ?? "").trim();
  const address = (c.address ?? "").trim();
  const hours = (c.hours ?? "").trim();
  const mapUrl = (c.map_url ?? "").trim();
  const primary = business.brand_colors.primary;

  // Nothing to show → render nothing (keeps Home tidy when not configured).
  if (!address && !phone && !mapUrl) return null;

  // No-key embed from the address. Falls back to a tappable banner if we
  // only have a maps link (short links can't be iframed).
  const embedSrc = address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`
    : null;
  const directionsUrl =
    mapUrl ||
    (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null);

  return (
    // CP-55: solid white full-width band so the map + Call-now sit on white,
    // not the page pattern. CP-55.1: extra bottom padding + a negative margin
    // that cancels the page's nav-clearance padding, so the white runs all the
    // way down behind the bottom nav (no patterned strip in the gap).
    <div
      className="bg-white border-t border-zinc-100 mt-6 px-4 pt-5"
      style={{ paddingBottom: "7rem", marginBottom: "-5rem" }}
    >
      <div className="rounded-2xl overflow-hidden border bg-white shadow-sm ring-1 ring-black/5">
        {embedSrc ? (
          <a href={directionsUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="block relative">
            <iframe
              title="Map"
              src={embedSrc}
              className="w-full h-44 border-0 pointer-events-none"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            {/* transparent overlay so the whole map is tappable → directions */}
            <span className="absolute inset-0" />
          </a>
        ) : directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-28 text-white font-bold"
            style={{ background: `linear-gradient(135deg, ${primary}, ${business.brand_colors.secondary})` }}
          >
            <MapPin className="h-5 w-5" /> View location <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}

        <div className="p-4">
          <div className="text-lg font-extrabold leading-tight" style={{ color: primary }}>
            {business.name}
          </div>
          {address && (
            <div className="mt-2 flex items-start gap-2 text-sm text-zinc-700">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-zinc-400" />
              <span>{address}</span>
            </div>
          )}
          {hours && (
            <div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-700">
              <Clock className="h-4 w-4 shrink-0 text-zinc-400" />
              <span>{hours}</span>
            </div>
          )}
        </div>

        {phone && (
          <a
            href={`tel:${phone.replace(/[^+\d]/g, "")}`}
            className="flex items-center justify-center gap-2 m-4 mt-0 py-3.5 rounded-2xl text-white font-extrabold shadow-md active:scale-[0.99] transition"
            style={{
              background: `linear-gradient(135deg, ${primary}, ${business.brand_colors.secondary})`,
              boxShadow: `0 10px 22px -8px ${primary}aa`,
            }}
          >
            <Phone className="h-4 w-4" /> Call now
          </a>
        )}
      </div>
    </div>
  );
}
