"use client";
/**
 * App chrome: the white top bar (title or wordmark, search + bag) and the
 * four-tab bottom bar (Home · Shop · Rewards · Profile).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberClinic } from "@/lib/remember";
import { IcBack, IcBag, IcGift, IcHome, IcSearch, IcUser } from "./icons";

const TABS = [
  { to: "", label: "Home", Icon: IcHome },
  { to: "/shop", label: "Shop", Icon: IcBag },
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
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-stretch justify-around border-t border-line bg-white/95 px-3 pt-2.5 backdrop-blur"
      style={{ paddingBottom: "calc(0.6rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {TABS.map(({ to, label, Icon }) => {
        const href = `${base}${to}`;
        const active = to === "" ? path === base : path === href || path.startsWith(`${href}/`);
        return (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className="flex flex-1 flex-col items-center gap-1 py-0.5 transition-transform active:scale-95">
            <span className="relative">
              <Icon className={`h-[25px] w-[25px] ${active ? "text-ink" : "text-faint"}`} strokeWidth={active ? 2 : 1.7} />
              {dot && to === `/${dot}` && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />}
            </span>
            <span className={`text-[11.5px] font-semibold ${active ? "text-ink" : "text-faint"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Tab header: title (or the clinic wordmark on Home) with search + bag on the right. */
export function TopBar({ slug, title, wordmark }: { slug: string; title?: string; wordmark?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between bg-white/95 px-5 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)", boxSizing: "content-box" }}>
      {wordmark ?? <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>}
      <div className="-mr-2 flex items-center">
        <Link href={`/${slug}/shop?tab=treatments&focus=1`} aria-label="Search" className="grid h-11 w-11 place-items-center"><IcSearch className="h-[23px] w-[23px]" /></Link>
        <Link href={`/${slug}/shop?tab=browse`} aria-label="Shop" className="grid h-11 w-11 place-items-center"><IcBag className="h-[23px] w-[23px]" /></Link>
      </div>
    </header>
  );
}

/** Round back button that floats over a hero photo. */
export function FloatingBack({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      aria-label="Back"
      className="absolute left-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur"
      style={{ top: "calc(12px + env(safe-area-inset-top, 0px))" }}
    >
      <IcBack className="h-5 w-5" strokeWidth={2.2} />
    </button>
  );
}

/** The clinic's logo, or its name set as a letter-spaced wordmark. */
export function Wordmark({ name, logoUrl, size = "md", invert }: { name: string; logoUrl: string | null; size?: "md" | "lg"; invert?: boolean }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={size === "lg" ? "h-14 w-auto max-w-[240px] object-contain" : "h-9 w-auto max-w-[150px] object-contain"} />;
  }
  return (
    <span className={`font-bold uppercase ${size === "lg" ? "text-[30px] tracking-[0.22em]" : "text-[17px] tracking-[0.2em]"} ${invert ? "text-white" : "text-ink"}`}>
      {name}
    </span>
  );
}
