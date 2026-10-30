"use client";
/**
 * Med spa app chrome — CP-193 · the top bar and the bottom tab bar.
 *
 * Dermis pattern: every tab opens with a white bar (title left, bag right);
 * Home swaps the title for the practice logo. Five tabs, Scan in the middle.
 * Links use the app base (path form or subdomain/PWA), see lib/use-app-base.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppBase } from "@/lib/use-app-base";
import { optimizedUrl } from "@/lib/img";
import { IcBag, IcChevronLeft, IcGift, IcHome, IcScan, IcUser } from "./icons";

const TABS = [
  { to: "", label: "Home", Icon: IcHome },
  { to: "/store", label: "Shop", Icon: IcBag },
  { to: "/scan", label: "Scan", Icon: IcScan },
  { to: "/rewards", label: "Rewards", Icon: IcGift },
  { to: "/profile", label: "Profile", Icon: IcUser },
] as const;

export function MsTabBar({ slug, dots }: { slug: string; dots: { rewards: boolean; profile: boolean } }) {
  const base = useAppBase(slug);
  const path = usePathname() ?? "";
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-stretch justify-around rounded-t-[26px] bg-white px-2 pt-3 shadow-[0_-8px_30px_-12px_rgba(23,28,45,0.22)]"
      style={{ paddingBottom: "calc(0.85rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {TABS.map(({ to, label, Icon }) => {
        const href = `${base}${to}`;
        const active = to === "" ? path === base || path === `${base}/` : path === href || path.startsWith(`${href}/`);
        const dot = (to === "/rewards" && dots.rewards) || (to === "/profile" && dots.profile);
        return (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className="flex flex-1 flex-col items-center gap-1 active:scale-95 transition-transform">
            <span className="relative">
              <Icon className="h-[27px] w-[27px]" style={{ color: active ? "var(--ms-p)" : "var(--ms-icon)" }} />
              {dot && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white" style={{ background: "var(--ms-p)" }} />}
            </span>
            <span className="text-[13px] font-medium" style={{ color: active ? "var(--ms-p)" : "var(--ms-icon)" }}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Top bar. `title` for tabs, `logoUrl` for Home, `back` for pushed screens (title centered). */
export function MsTopBar({ slug, title, logoUrl, logoAlt, bagCount, back, onBack, hideBag }: {
  slug: string; title?: string; logoUrl?: string | null; logoAlt?: string; bagCount?: number;
  back?: string; onBack?: () => void; hideBag?: boolean;
}) {
  const base = useAppBase(slug);
  const bag = !hideBag && (
    <Link href={`${base}/store?tab=mine`} aria-label={bagCount ? `Your orders, ${bagCount} open` : "Your orders"} className="relative -mr-1 grid h-11 w-11 place-items-center">
      <IcBag className="h-[28px] w-[28px]" style={{ color: "var(--ms-ink)" }} />
      {!!bagCount && (
        <span className="absolute right-0.5 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white" style={{ background: "var(--ms-p)" }}>{bagCount > 9 ? "9+" : bagCount}</span>
      )}
    </Link>
  );
  if (back !== undefined || onBack) {
    const inner = <><IcChevronLeft className="h-5 w-5" /><span className="text-[17px]">Back</span></>;
    return (
      <header className="sticky top-0 z-30 grid h-[68px] grid-cols-[1fr_auto_1fr] items-center bg-white px-4">
        {onBack
          ? <button type="button" onClick={onBack} className="flex items-center gap-1 justify-self-start" style={{ color: "var(--ms-sub)" }}>{inner}</button>
          : <Link href={`${base}${back}`} className="flex items-center gap-1 justify-self-start" style={{ color: "var(--ms-sub)" }}>{inner}</Link>}
        <h1 className="text-[24px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ms-ink)" }}>{title}</h1>
        <span />
      </header>
    );
  }
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between bg-white px-5 shadow-[0_6px_18px_-16px_rgba(23,28,45,0.35)]">
      {logoUrl
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={optimizedUrl(logoUrl, 160)} alt={logoAlt ?? ""} className="h-11 w-auto max-w-[150px] object-contain" />
        : <h1 className="text-[30px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>{title ?? logoAlt}</h1>}
      {bag}
    </header>
  );
}
