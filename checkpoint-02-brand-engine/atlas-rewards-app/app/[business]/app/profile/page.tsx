import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { EditableProfile } from "@/components/customer/editable-profile";
import { DeleteAccountSection } from "@/components/customer/delete-account-section";
import { MyShops } from "@/components/customer/my-shops";
import { NotificationPreferences } from "@/components/customer/notification-preferences";
import { ProfileHelpLinks } from "@/components/customer/profile-help-links";
import { FrontDeskCard } from "@/components/staff/app-switch";
// CP-193: med spa Profile screen.
import { isMedspaApp } from "@/lib/medspa-app/route";
import { MedspaProfile } from "@/components/medspa-app/profile-screen";

export const dynamic = "force-dynamic";

export default async function ProfileTab({ params }: { params: { business: string } }) {
  // CP-89: request-memoized — dedupes with the app layout's fetches.
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  if (isMedspaApp(business)) return <MedspaProfile business={business} joinedAt={(await getMyMembership(business.id))?.joined_at ?? null} />;
  const supabase = createClient();

  const user = await getCachedUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
  const mem = await getMyMembership(business.id);
  // CP-179: staff for THIS business (or agency staff) get a way to the desk.
  const { data: roles } = await supabase
    .from("business_users").select("role, business_id").eq("user_id", user!.id);
  const isStaff = (roles ?? []).some((r: { role: string; business_id: string | null }) =>
    r.role === "agency_admin" || r.role === "agency_va" ||
    (r.business_id === business.id && (r.role === "business_manager" || r.role === "business_staff")));

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

      {isStaff && <FrontDeskCard primary={business.brand_colors?.primary ?? "#0891b2"} />}

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

      {/* CP-96: Help & Support + Terms + Privacy — Apple App Review wants
          the privacy policy reachable inside the app, and customers get a
          real support path. */}
      <ProfileHelpLinks primary={business.brand_colors?.primary ?? "#0891b2"} />

      {/* CP-81.3: PushDiagnostics removed for tester release — the
          component still exists (components/customer/push-diagnostics.tsx)
          and can be re-mounted here in one line if debugging is needed. */}

      {/* CP-40: customer self-delete account section. Lives at the
          bottom so it's discoverable but not in the way of regular
          profile editing. */}
      <DeleteAccountSection business={business} />
    </>
  );
}
