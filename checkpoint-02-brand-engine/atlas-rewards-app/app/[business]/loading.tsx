import { CachedHomeOrLoading } from "@/components/customer/home-snapshot";

/**
 * Customer-app route boundary loading. CP-41 — friends gave feedback
 * that taps felt unresponsive; this surfaces the loading moment.
 * CP-42: BrandedLoading picks up the per-business brand color from
 * localStorage (cached by the layout) so repeat visitors see THEIR
 * business's color instead of generic Atlas blue.
 * CP-211: on a cold open of Home, returning customers see their last-known
 * card + points (from the phone) instead of a spinner, while fresh data
 * streams in. Everything else still gets the branded loader.
 */
export default function BusinessLoading() {
  return <CachedHomeOrLoading title="One sec…" />;
}
