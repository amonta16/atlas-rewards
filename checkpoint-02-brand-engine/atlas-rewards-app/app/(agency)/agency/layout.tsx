import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/agency/sidebar";

export const dynamic = "force-dynamic";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div
      className="min-h-screen flex"
      style={{
        // Soft ocean wash behind the content — gives the white cards more
        // contrast without going all-in on a colored canvas.
        background:
          "linear-gradient(180deg, #eaf3f8 0%, #f1f5f9 35%, #f8fafc 100%)",
      }}
    >
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
