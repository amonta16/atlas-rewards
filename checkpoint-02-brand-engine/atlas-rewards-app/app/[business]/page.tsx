import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function BusinessRootPage({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If signed in, jump straight into the app
  if (user) redirect("/app");

  const { data } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = data as Business;

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)`,
      }}
    >
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center text-white">
          {business.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={business.logo_url} alt={business.name} className="h-16 mx-auto bg-white rounded-2xl p-2" />
          ) : (
            <div className="h-16 w-16 mx-auto rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Gift className="h-8 w-8 text-white" />
            </div>
          )}

          <h1 className="text-4xl font-bold mt-8 leading-tight">
            {business.welcome_message || `Welcome to ${business.name}`}
          </h1>
          <p className="text-white/85 mt-3">
            Earn points on every visit. Unlock rewards. Members get more.
          </p>

          <div className="mt-10 space-y-3">
            <Link href="/signup">
              <Button size="lg" className="w-full h-12 bg-white text-zinc-900 hover:bg-zinc-100">
                Join the rewards program <ArrowRight className="h-4 w-4 ml-2"/>
              </Button>
            </Link>
            <Link href="/login" className="block text-sm text-white/85 hover:text-white">
              Already a member? Sign in
            </Link>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-white/60">
        Powered by Atlas Rewards
      </footer>
    </main>
  );
}
