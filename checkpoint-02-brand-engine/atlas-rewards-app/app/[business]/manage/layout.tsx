import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Business } from "@/lib/types/database";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// CP-43.4: point the FRONT-DESK pages at the front-desk manifest so the
// installed desktop/taskbar app opens straight to the front desk (not the
// customer view). Served by the route handler at /<slug>/manage-manifest
// (a nested manifest.ts metadata file 404s in Next, so we use a route).
export async function generateMetadata({ params }: { params: { business: string } }): Promise<Metadata> {
  return { manifest: `/${params.business}/manage-manifest` };
}

export default async function ManagerLayout({
  children, params,
}: { children: React.ReactNode; params: { business: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // CP-43 fix: carry a ?next back to /manage so that after signing in the
  // admin/manager lands on the FRONT DESK — not the customer app. Before
  // this, the bare redirect("/login") dropped them on /app (the customer
  // preview), and only a SECOND trip to /manage (now that the session
  // cookie existed) actually reached the desk. The business-scoped path
  // works on both the subdomain and path-based topologies.
  if (!user) redirect(`/${params.business}/login?next=/${params.business}/manage`);

  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  if (!biz) notFound(); // CP-36
  const business = biz as Business;

  // Auth gate: must be agency staff (admin OR VA) OR a manager/front-desk
  // user for THIS business.
  const { data: roles } = await supabase
    .from("business_users")
    .select("role, business_id")
    .eq("user_id", user.id);

  // CP-82: agency_va joins agency_admin here. A VA builds and maintains the
  // apps, so she needs to open any business's front desk to test scanning,
  // awarding, offers and memberships. The data-layer twin of this gate is
  // is_business_manager() / staffs_business(), widened for VAs in
  // checkpoint-82-va-frontdesk-and-library/cp82_va_permissions.sql — the UI
  // check alone would just trade this card for RLS errors on the desk.
  const isAgencyStaff = roles?.some(r => r.role === "agency_admin" || r.role === "agency_va");
  const isManager = roles?.some(r => r.business_id === business.id && (r.role === "business_manager" || r.role === "business_staff"));

  if (!isAgencyStaff && !isManager) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <Shield className="h-5 w-5" />
              <CardTitle>Manager access required</CardTitle>
            </div>
            <CardDescription>
              You're signed in as {user.email}, but this account isn't a manager for {business.name}.
              Promote yourself with the SQL snippet in the CP 3 README.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/${params.business}/app`}><Button variant="outline" className="w-full">Go to customer app instead</Button></Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
