/**
 * lib/preview/places.ts — CP-232 · Google Places API (New), server side only.
 *
 * The browser never sees GOOGLE_PLACES_API_KEY: autocomplete and details are
 * proxied through /api/preview/places/*. One session token per search ties the
 * autocomplete keystrokes and the final details call into one billed session.
 */

export type Suggestion = { placeId: string; main: string; secondary: string };
export type PlaceDetails = {
  placeId: string; name: string; address: string | null; phone: string | null; website: string | null;
  lat: number | null; lng: number | null; zip: string | null; types: string[];
};

export const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
export const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

const BASE = "https://places.googleapis.com/v1";

function key(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

async function timed(url: string, init: RequestInit, ms = 6000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export function placesConfigured(): boolean {
  return !!key();
}

export async function autocomplete(input: string, sessionToken: string): Promise<Suggestion[]> {
  const k = key();
  if (!k) throw new Error("places_not_configured");
  const r = await timed(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": k,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({ input, sessionToken, includedRegionCodes: ["us"], languageCode: "en" }),
  });
  if (!r.ok) throw new Error(`places_autocomplete_${r.status}`);
  const j = (await r.json()) as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }>;
  };
  return (j.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId && PLACE_ID_RE.test(p.placeId))
    .slice(0, 6)
    .map((p) => ({ placeId: p.placeId!, main: p.structuredFormat?.mainText?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }));
}

export async function placeDetails(placeId: string, sessionToken?: string | null): Promise<PlaceDetails | null> {
  const k = key();
  if (!k) throw new Error("places_not_configured");
  if (!PLACE_ID_RE.test(placeId)) return null;
  const qs = sessionToken && SESSION_RE.test(sessionToken) ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const r = await timed(`${BASE}/places/${encodeURIComponent(placeId)}${qs}`, {
    headers: {
      "X-Goog-Api-Key": k,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,nationalPhoneNumber,websiteUri,addressComponents,types",
    },
  });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`places_details_${r.status}`);
  const p = (await r.json()) as {
    id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number };
    nationalPhoneNumber?: string; websiteUri?: string; types?: string[];
    addressComponents?: Array<{ shortText?: string; types?: string[] }>;
  };
  const zip = p.addressComponents?.find((c) => c.types?.includes("postal_code"))?.shortText ?? null;
  return {
    placeId: p.id ?? placeId,
    name: (p.displayName?.text ?? "").slice(0, 160),
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
    lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
    zip: zip && /^\d{5}/.test(zip) ? zip.slice(0, 5) : null,
    types: p.types ?? [],
  };
}
