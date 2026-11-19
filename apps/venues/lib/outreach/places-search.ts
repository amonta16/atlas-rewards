/**
 * lib/outreach/places-search.ts — CP-250 · find med spas in an area with Google Places Text Search (New).
 *
 * Server only; reuses GOOGLE_PLACES_API_KEY (CP-232). Website, phone and rating are "Enterprise"
 * fields (1,000 free searches a month, then about $35 per 1,000), plenty at outreach volume.
 * Google's terms limit storing Places content, so a lead keeps its place_id and what we later read
 * from the spa's own website; the listing fields are a starting point, not a database we resell.
 */

export type PlaceHit = {
  placeId: string; name: string; address: string | null; city: string | null; state: string | null;
  website: string | null; phone: string | null; rating: number | null; reviews: number | null; open: boolean;
};

const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents", "places.websiteUri",
  "places.nationalPhoneNumber", "places.rating", "places.userRatingCount", "places.businessStatus", "nextPageToken",
].join(",");

type RawPlace = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string;
  rating?: number; userRatingCount?: number; businessStatus?: string;
  addressComponents?: Array<{ shortText?: string; longText?: string; types?: string[] }>;
};

function comp(p: RawPlace, type: string, short = true): string | null {
  const c = p.addressComponents?.find((x) => x.types?.includes(type));
  return (short ? c?.shortText : c?.longText) ?? null;
}

export async function searchPlaces(query: string, pageToken?: string | null): Promise<{ hits: PlaceHit[]; next: string | null }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set.");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      cache: "no-store",
      signal: ac.signal,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: query.slice(0, 200), regionCode: "us", languageCode: "en", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    if (!r.ok) throw new Error(`Places search failed (${r.status}).`);
    const j = (await r.json()) as { places?: RawPlace[]; nextPageToken?: string };
    const hits = (j.places ?? []).filter((p) => p.id && p.displayName?.text).map((p) => ({
      placeId: p.id!,
      name: p.displayName!.text!.slice(0, 160),
      address: p.formattedAddress ?? null,
      city: comp(p, "locality", false) ?? comp(p, "sublocality", false),
      state: comp(p, "administrative_area_level_1"),
      website: p.websiteUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      open: (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL",
    }));
    return { hits, next: j.nextPageToken ?? null };
  } finally {
    clearTimeout(t);
  }
}
