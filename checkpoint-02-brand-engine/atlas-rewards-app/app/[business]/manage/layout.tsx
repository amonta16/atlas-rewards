import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ManagerLayout({
  children, params,
}: { children: React.ReactNode; params: { business: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  if (!biz) notFound(); // CP-36
  const business = biz as Business;

  // Auth gate: must be agency_admin OR business_manager for THIS business
  const { data: roles } = await supabase
    .from("business_users")
    .select("role, business_id")
    .eq("user_id", user.id);

  const isAdmin = roles?.some(r => r.role === "agency_admin");
  const isManager = roles?.some(r => r.business_id === business.id && (r.role === "business_manager" || r.role === "business_staff"));

  if (!isAdmin && !isManager) {
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
            <Link href="/app"><Button variant="outline" className="w-full">Go to customer app instead</Button></Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
