"use client";
/**
 * App chrome: the white top bar (wordmark or title, search + bag), the
 * Back bar for detail screens, and the five-tab bottom bar
 * (Home · Shop · Scan · Rewards · Profile).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberClinic } from "@/lib/remember";
import { IcBack, IcBag, IcGift, IcHome, IcScan, IcSearch, IcUser } from "./icons";

const TABS = [
  { to: "", label: "Home", Icon: IcHome },
  { to: "/shop", label: "Shop", Icon: IcBag },
  { to: "/scan", label: "Scan", Icon: IcScan },
  { to: "/rewards", label: "Rewards", Icon: IcGift },
  { to: "/profile", label: "Profile", Icon: IcUser },
] as const;

export function TabBar({ slug, dot }: { slug: string; dot?: "rewards" | "profile" | null }) {
  const path = usePathname() ?? "";
  const base = `/${slug}`;
  useEffect(() => { rememberClinic(slug); }, [slug]);
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-stretch justify-around rounded-t-[22px] bg-white px-2 pt-2.5 shadow-bar"
      style={{ paddingBottom: "calc(0.55rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {TABS.map(({ to, label, Icon }) => {
        const href = `${base}${to}`;
        const active = to === "" ? path === base : path === href || path.startsWith(`${href}/`);
        return (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className="flex flex-1 flex-col items-center gap-[3px] py-0.5 transition-transform active:scale-95">
            <span className="relative">
              <Icon className={`h-6 w-6 ${active ? "text-ink" : "text-faint"}`} strokeWidth={active ? 1.9 : 1.55} />
              {dot && to === `/${dot}` && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />}
            </span>
            <span className={`text-[11px] ${active ? "font-semibold text-ink" : "font-medium text-faint"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Actions({ slug }: { slug: string }) {
  return (
    <div className="-mr-2 flex items-center">
      <Link href={`/${slug}/shop?tab=treatments&focus=1`} aria-label="Search" className="grid h-10 w-10 place-items-center"><IcSearch className="h-[22px] w-[22px]" /></Link>
      <Link href={`/${slug}/orders`} aria-label="My purchases" className="grid h-10 w-10 place-items-center"><IcBag className="h-[22px] w-[22px]" /></Link>
    </div>
  );
}

/** Tab header: title (or the clinic wordmark on Home) with search + bag on the right. */
export function TopBar({ slug, title, wordmark }: { slug: string; title?: string; wordmark?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between bg-white px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)", boxSizing: "content-box" }}>
      {wordmark ?? <h1 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h1>}
      <Actions slug={slug} />
    </header>
  );
}

/** Detail screens: "‹ Back", a centred title, search + bag. */
export function SubBar({ slug, title, fallback }: { slug: string; title: string; fallback: string }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 grid h-[54px] grid-cols-[1fr_auto_1fr] items-center bg-white px-4" style={{ paddingTop: "env(safe-area-inset-top, 0px)", boxSizing: "content-box" }}>
      <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))} className="flex items-center gap-0.5 justify-self-start text-[13px] font-medium text-sub">
        <IcBack className="h-4 w-4" strokeWidth={2} />Back
      </button>
      <h1 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
      <div className="justify-self-end"><Actions slug={slug} /></div>
    </header>
  );
}

/** The clinic's logo, or its name set as a letter-spaced wordmark. */
export function Wordmark({ name, logoUrl, size = "md", invert }: { name: string; logoUrl: string | null; size?: "sm" | "md" | "lg"; invert?: boolean }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={size === "lg" ? "h-14 w-auto max-w-[240px] object-contain" : size === "sm" ? "h-6 w-auto max-w-[130px] object-contain" : "h-9 w-auto max-w-[150px] object-contain"} />;
  }
  return (
    <span className={`font-bold uppercase ${size === "lg" ? "text-[30px] tracking-[0.22em]" : size === "sm" ? "text-[11.5px] tracking-[0.2em]" : "text-[17px] tracking-[0.2em]"} ${invert ? "text-white" : "text-ink"}`}>
      {name}
    </span>
  );
}
