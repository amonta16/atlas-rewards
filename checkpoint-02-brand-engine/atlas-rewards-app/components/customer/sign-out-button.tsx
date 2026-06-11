"use client";
import { LogOut } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const pathname = usePathname();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // CP-45: slug-aware — keep the /<slug> prefix on path-based access so
    // sign-out lands on this business's login instead of a 404.
    const base = pathname?.match(/^(.*?)\/app(\/|$)/)?.[1] ?? "";
    router.push(`${base}/login`);
    router.refresh();
  }
  return (
    <Button variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="h-4 w-4 mr-2" /> Sign out
    </Button>
  );
}
