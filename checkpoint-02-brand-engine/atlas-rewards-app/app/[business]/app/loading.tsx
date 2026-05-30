import { BrandedLoading } from "@/components/ui/branded-loading";

// CP-42: BrandedLoading reads cached per-business brand color from
// localStorage so this screen matches the business's theme.
export default function CustomerAppLoading() {
  return <BrandedLoading title="Loading your rewards…" />;
}
