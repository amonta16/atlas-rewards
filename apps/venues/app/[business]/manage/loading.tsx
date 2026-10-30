import { BrandedLoading } from "@/components/ui/branded-loading";

// CP-42: themed per-business via the localStorage brand cache.
export default function ManageLoading() {
  return <BrandedLoading title="Opening front desk…" />;
}
