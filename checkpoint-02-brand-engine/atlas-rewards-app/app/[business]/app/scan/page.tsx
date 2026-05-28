import { createClient } from "@/lib/supabase/server";
import { ScanClient } from "@/components/customer/scan-client";
import { HeaderActions } from "@/components/customer/header-actions";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ScanTab({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const mem = (memRows?.[0] ?? null) as Membership | null;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();

  return (
    <>
      <div className="px-4 pt-3 pb-3 flex items-center justify-between bg-white border-b border-zinc-100">
        {business.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={business.logo_url} alt={business.name} className="h-9 max-w-[140px] object-contain" />
        ) : (
          <div
            className="h-9 px-3 rounded-full flex items-center text-white text-xs font-bold max-w-[160px]"
            style={{ background: business.brand_colors.primary }}
          >
            <span className="truncate">{business.name}</span>
          </div>
        )}
        <HeaderActions
          business={business}
          membershipId={mem?.id ?? null}
          membership={mem}
        />
      </div>
      <ScanClient business={business} membership={mem} fullName={profile?.full_name ?? user!.email ?? "Member"} />
    </>
  );
}
