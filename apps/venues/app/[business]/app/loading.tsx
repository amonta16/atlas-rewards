import { BrandedLoading } from "@/components/ui/branded-loading";

/**
 * Tab-switch loading screen.
 *
 * CP-106 briefly swapped this for a pulse skeleton; Andrew preferred the
 * branded screen, so it's back. It also shows far less often now than it used
 * to — before CP-106, in-app links were plain <a> tags, so this fired on a
 * full document reload. Now it only covers the RSC fetch between tabs.
 *
 * CP-42: BrandedLoading reads the cached per-business brand color from
 * localStorage so this screen matches the business's theme.
 */
export default function CustomerAppLoading() {
  return <BrandedLoading title="Loading your rewards…" />;
}
