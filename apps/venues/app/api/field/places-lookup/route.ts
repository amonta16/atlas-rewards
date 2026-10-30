/**
 * POST /api/field/places-lookup — CP-128 (instant-demo auto-fill)
 *
 * The rep types a business name at the door; this looks it up on Google
 * Places, and hands back everything the Instant Demo modal can pre-fill:
 * the canonical name, the niche (mapped from Places types via guessNiche),
 * the address/phone/website, and — when the business has a website — its
 * logo as a data URL (apple-touch-icon → og:image → favicon → Google's
 * favicon service), so the existing in-browser palette extraction works
 * without any cross-origin canvas issues.
 *
 * Uses the Places API (New) Text Search with an optional location bias from
 * the rep's phone GPS, so "Joe's" finds the Joe's they're standing in front
 * of, not one in Ohio.
 *
 * Setup: set GOOGLE_PLACES_API_KEY in Vercel (Places API (New) enabled,
 * billing on — lookups cost fractions of a cent). Without the key the route
 * answers 501 and the modal degrades gracefully to manual entry.
 *
 * Auth: agency_admin only — same gate as the Field App page itself.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { guessNiche } from "@/lib/demo-packs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UA = "Mozilla/5.0 (compatible; AtlasRewards/1.0; +https://atlas-engine.app)";

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 4500): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch an image URL and return it as a data URL (or null if it isn't a
 *  usable image). Size-capped so a rogue site can't feed us a 50MB "logo". */
async function imageAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, 4500);
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200 || buf.length > 3_000_000) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Best-effort logo from the business website: apple-touch-icon (usually the
 *  crispest square mark) → og:image → favicon link → Google's favicon
 *  service as the last resort. Every step is optional and time-boxed. */
async function huntLogo(website: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(website, { headers: { "User-Agent": UA, Accept: "text/html" } }, 4500);
    if (r.ok) {
      const base = r.url || website; // follow redirects for relative hrefs
      const html = (await r.text()).slice(0, 300_000);
      const candidates: string[] = [];
      const push = (re: RegExp) => {
        const m = html.match(re);
        if (m?.[1]) candidates.push(m[1]);
      };
      push(/<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*href=["']([^"']+)["']/i);
      push(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon(?:-precomposed)?["']/i);
      push(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      push(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      push(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
      for (const c of candidates) {
        const abs = absolutize(c, base);
        if (!abs || !/^https?:/i.test(abs)) continue;
        const d = await imageAsDataUrl(abs);
        if (d) return d;
      }
    }
  } catch {
    /* fall through to the favicon service */
  }
  try {
    const host = new URL(website).hostname;
    return await imageAsDataUrl(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: { query?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

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

  const hasBias =
    typeof body.lat === "number" && Number.isFinite(body.lat) &&
    typeof body.lng === "number" && Number.isFinite(body.lng);

  let search: Response;
  try {
    search = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.websiteUri,places.nationalPhoneNumber",
      },
      body: JSON.stringify({
        textQuery: query,
        ...(hasBias
          ? { locationBias: { circle: { center: { latitude: body.lat, longitude: body.lng }, radius: 8000 } } }
          : {}),
      }),
    }, 6000);
  } catch {
    return NextResponse.json({ error: "Places lookup timed out — fill in manually." }, { status: 504 });
  }

  if (!search.ok) {
    return NextResponse.json({ error: `Places lookup failed (${search.status})` }, { status: 502 });
  }

  const data = (await search.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      primaryType?: string;
      websiteUri?: string;
      nationalPhoneNumber?: string;
    }>;
  };
  const p = data.places?.[0];
  if (!p) {
    return NextResponse.json({ error: "No match found nearby — check the spelling." }, { status: 404 });
  }

  const name = p.displayName?.text || query;
  const typeSoup = [name, p.primaryType ?? "", ...(p.types ?? [])].join(" ");
  const niche = guessNiche(typeSoup, "general");
  const website = p.websiteUri ?? null;
  const logoDataUrl = website ? await huntLogo(website) : null;

  return NextResponse.json({
    name,
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website,
    niche,
    logoDataUrl,
    // CP-129: the shop's REAL "write a review" page — wired straight into
    // the demo's Google review boost.
    reviewUrl: p.id ? `https://search.google.com/local/writereview?placeid=${p.id}` : null,
  });
}
