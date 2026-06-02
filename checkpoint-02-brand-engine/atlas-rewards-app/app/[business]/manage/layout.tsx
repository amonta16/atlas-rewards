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
            <Car