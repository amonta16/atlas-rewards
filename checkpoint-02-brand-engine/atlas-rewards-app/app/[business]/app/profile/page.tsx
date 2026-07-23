import { createClient } from "@/lib/supabase/server";
import { EditableProfile } from "@/components/customer/editable-profile";
import { DeleteAccountSection } from "@/components/customer/delete-account-section";
import { MyShops } from "@/components/customer/my-shops";
import { NotificationPreferences } from "@/components/customer/notification-preferences";
import { PushDiagnostics } from "@/components/customer/push-diagnostics";
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
          joined,
        }}
      />

      {/* CP-81 → CP-81.1: every shop this customer belongs to — switch
          between them or add a new one, all under the same account.
          Sits ABOVE Notifications (Andrew's requested order). */}
      <MyShops
        currentBusinessId={business.id}
        primary={business.brand_colors?.primary ?? "#0891b2"}
      />

      {/* CP-36b (moved here in CP-81.1 from inside EditableProfile):
          per-customer notification preferences. Self-hides if the cp36
          SQL hasn't been applied yet. */}
      <NotificationPreferences
        businessId={business.id}
        primary={business.brand_colors?.primary ?? "#0891b2"}
      />

      {/* CP-81.1: native-only notification diagnostics + onboarding
          replay — pre-launch testing aid, invisible on the web. */}
      <PushDiagnostics businessId={business.id} />

      {/* CP-40: customer self-delete account section. Lives at the
          bottom so it's discoverable but not in the way of regular
          profile editing. */}
      <DeleteAccountSection business={business} />
    </>
  );
}
