/**
 * Who may use the front desk: the same rule as the venue manager portal
 * (current_app_role → agency_admin / business_manager / business_staff).
 * Staff sign in with the same email + password they use there.
 */
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import type { Clinic } from "./clinic";

export type StaffRole = "agency_admin" | "business_manager" | "business_staff";
export type Staff = { userId: string; role: StaffRole; name: string; isManager: boolean };
const ROLES: StaffRole[] = ["agency_admin", "business_manager", "business_staff"];

export async function getStaff(clinic: Clinic): Promise<Staff | "signed-out" | "no-access"> {
  if (clinic.isExample && clinic.id === "example") return { userId: "demo", role: "business_manager", name: "Front desk", isManager: true };
  const user = await getCachedUser().catch(() => null);
  if (!user) return "signed-out";
  const supabase = createClient();
  const [{ data: role }, { data: nm }] = await Promise.all([
    supabase.rpc("current_app_role", { p_business_id: clinic.id }),
    supabase.rpc("my_display_name"),
  ]);
  const r = (typeof role === "string" ? role : (Array.isArray(role) ? role[0] : null)) as StaffRole | null;
  if (!r || !ROLES.includes(r)) return "no-access";
  const name = (typeof nm === "string" && nm) || user.email?.split("@")[0] || "Staff";
  return { userId: user.id, role: r, name, isManager: r !== "business_staff" };
}
