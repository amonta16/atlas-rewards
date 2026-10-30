/**
 * MedspaProfile — CP-193 · /<slug>/app/profile for med spas.
 * My care and orders live here now that the tab bar is Dermis's five tabs;
 * the account sections below are the shared ones.
 */
import type { Business } from "@/lib/types/database";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { AppLink } from "@/components/customer/app-link";
import { EditableProfile } from "@/components/customer/editable-profile";
import { DeleteAccountSection } from "@/components/customer/delete-account-section";
import { MyShops } from "@/components/customer/my-shops";
import { NotificationPreferences } from "@/components/customer/notification-preferences";
import { ProfileHelpLinks } from "@/components/customer/profile-help-links";
import { FrontDeskCard } from "@/components/staff/app-switch";
import { getMsOpenOrderCount } from "@/lib/medspa-app/data";
import { MsTopBar } from "./chrome";
import { IcBag, IcChevronRight, IcHeart } from "./icons";

export async function MedspaProfile({ business, joinedAt }: { business: Business; joinedAt: string | null }) {
  const user = await getCachedUser();
  const uid = user?.id ?? "";
  const supabase = createClient();
  const [{ data: profile }, { data: roles }, bag] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("business_users").select("role, business_id").eq("user_id", uid),
    getMsOpenOrderCount(business.id, uid),
  ]);
  const isStaff = (roles ?? []).some((r: { role: string; business_id: string | null }) =>
    r.role === "agency_admin" || r.role === "agency_va" ||
    (r.business_id === business.id && (r.role === "business_manager" || r.role === "business_staff")));
  const primary = business.brand_colors.primary;
  const joined = joinedAt ? new Date(joinedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const row = "flex items-center gap-4 rounded-2xl bg-white px-5 py-[18px] ring-1 ring-[var(--ms-line)] active:scale-[.99] transition";

  return (
    <div className="bg-[var(--ms-bg)] pb-4">
      <MsTopBar slug={business.slug} title="Profile" bagCount={bag} />
      <div className="space-y-3 px-5 pt-6">
        <AppLink slug={business.slug} to="/care" className={row}>
          <IcHeart className="h-7 w-7" style={{ color: "var(--ms-p)" }} />
          <span className="flex-1"><span className="block text-[18px]" style={{ color: "var(--ms-ink)" }}>My care</span><span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>Treatments, aftercare and due dates</span></span>
          <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-icon)" }} />
        </AppLink>
        <AppLink slug={business.slug} to="/store?tab=mine" className={row}>
          <IcBag className="h-7 w-7" style={{ color: "var(--ms-p)" }} />
          <span className="flex-1"><span className="block text-[18px]" style={{ color: "var(--ms-ink)" }}>Your orders</span><span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>{bag ? `${bag} open` : "Packages, skincare and gift cards"}</span></span>
          <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-icon)" }} />
        </AppLink>
      </div>
      <EditableProfile business={business} initial={{ email: profile?.email ?? user?.email ?? null, full_name: profile?.full_name ?? null, phone: profile?.phone ?? null, birthday: profile?.birthday ?? null, joined }} />
      {isStaff && <FrontDeskCard primary={primary} />}
      <MyShops currentBusinessId={business.id} primary={primary} />
      <NotificationPreferences businessId={business.id} primary={primary} />
      <ProfileHelpLinks primary={primary} />
      <DeleteAccountSection business={business} />
    </div>
  );
}
