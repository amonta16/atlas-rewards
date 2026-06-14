import { createClient } from "@/lib/supabase/server";
import { EditableProfile } from "@/components/customer/editable-profile";
import { DeleteAccountSection } from "@/components/customer/delete-account-section";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ProfileTab({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const mem = (memRows?.[0] ?? null) as Membership | null;

  const joined = mem?.joined_at
    ? new Date(mem.joined_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

  return (
    <>
      {/* CP-52.4: header now global (app shell) — removed the per-tab copy. */}
      <EditableProfile
        business={business}
        initial={{
          email: profile?.email ?? user!.email ?? null,
          full_name: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          birthday: profile?.birthday ?? null,
          tier: mem?.tier ?? "Bronze",
          joined,
        }}
      />

      {/* CP-40: customer self-delete account section. Lives at the
          bottom so it's discoverable but not in the way of regular
          profile editing. */}
      <DeleteAccountSection business={business} />
    </>
  );
}
