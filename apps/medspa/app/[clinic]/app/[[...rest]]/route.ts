import { NextResponse, type NextRequest } from "next/server";

/**
 * Pushes, emails and automations are sent by the venue app's engine (CP-217
 * suite, broadcasts, crons) with venue-style links like "/app/book" or
 * "/app/membership". When one is opened in the med spa app this route
 * sends it to the matching med spa screen.
 */
export const dynamic = "force-dynamic";

const MAP: [RegExp, (q: URLSearchParams) => string][] = [
  [/^membership/, () => "shop?tab=memberships"],
  [/^rewards/, () => "rewards"],
  [/^(store|shop)/, (q) => (q.get("tab") === "mine" ? "orders" : "shop?tab=browse")],
  [/^(treatments|menu)/, () => "shop?tab=treatments"],
  [/^profile|^account/, () => "profile"],
];

export function GET(req: NextRequest, { params }: { params: { clinic: string; rest?: string[] } }) {
  const rest = (params.rest ?? []).join("/");
  const hit = MAP.find(([re]) => re.test(rest));
  const to = hit ? hit[1](req.nextUrl.searchParams) : ""; // book, care, home → Home (it has "Book your next visit")
  return NextResponse.redirect(new URL(`/${params.clinic}${to ? `/${to}` : ""}`, req.url));
}
