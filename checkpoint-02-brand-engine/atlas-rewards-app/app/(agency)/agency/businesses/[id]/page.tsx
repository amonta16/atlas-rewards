import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandEditor } from "@/components/brand-editor/brand-editor";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function BusinessEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !business) notFound();

  return <BrandEditor initial={business as Business} />;
}
