import { AtlasLoading } from "@/components/ui/atlas-loading";

/**
 * Customer-app route boundary loading. CP-41 — friends gave feedback
 * that taps felt unresponsive; this surfaces the loading moment.
 * Brand-color falls back to Atlas defaults until the per-business
 * theme resolves (server-rendered downstream).
 */
export default function BusinessLoading() {
  return <AtlasLoading title="One sec…" />;
}
