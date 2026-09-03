/**
 * POST /api/field/places-nearby — CP-128.2 ("Scan this plaza")
 *
 * The rep stands in a parking lot and taps Scan: this pulls every storefront
 * within `radius` meters from Google Places (New) Nearby Search, guesses each
 * one's demo niche, and hands the list back for the batch builder. Obvious
 * non-prospects (gas stations, banks, schools, offices…) are filtered out —
 * anything wrongly filtered can still be typed into the list by hand.
 *
 * Same setup + gate as /api/field/places-lookup (CP-128): agency_admin only,
 * GOOGLE_PLACES_API_KEY required (501 "places_not_configured" without it).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { guessNiche } from "@/lib/demo-packs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Place types that are never door-to-door loyalty prospects. */
const EXCLUDE = new Set([
  "lodging", "hotel", "motel", "gas_station", "parking", "atm", "bank",
  "church", "place_of_worship", "school", "primary_school", "secondary_school",
  "university", "hospital", "doctor", "dentist", "pharmacy", "veterinary_care",
  "local_government_office", "post_office", "police", "fire_station",
  "storage", "car_dealer", "car_rental", "car_repair", "real_estate_agency",
  "insurance_agency", "lawyer", "accounting", "funeral_home", "cemetery",
  "transit_station", "bus_station", "train_station", "corporate_office",
  "apartment_complex", "apartment_building",
]);

export async function POST(req: NextRequest) {
  let body: { lat?: number; lng?: number; radius?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const lat = body.lat, lng = body.lng;
  if (typeof lat !== "number" || !Number.isFinite(lat) || typeof lng !== "number" || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }
  const radius = Math.min(1000, Math.max(50, Number(body.radius) || 250));

  // Same gate as the Field App page (CP-63): agency_admin only.
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const { data: roleRows } = await server
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "places_not_configured" }, { status: 501 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let search: Response;
  try {
    search = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.types,places.primaryType",
      },
      body: JSON.stringify({
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Scan timed out — try again." }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }

  if (!search.ok) {
    return NextResponse.json({ error: `Scan failed (${search.status})` }, { status: 502 });
  }

  const data = (await search.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      primaryType?: string;
    }>;
  };

  const places = (data.places ?? [])
    .filter((p) => {
      const types = [p.primaryType, ...(p.types ?? [])].filter(Boolean) as string[];
      return p.displayName?.text && !types.some((t) => EXCLUDE.has(t));
    })
    .map((p) => {
      const name = p.displayName!.text!;
      const soup = [name, p.primaryType ?? "", ...(p.types ?? [])].join(" ");
      return {
        name,
        address: p.formattedAddress ?? null,
        niche: guessNiche(soup, "general"),
      };
    });

  return NextResponse.json({ places });
}
