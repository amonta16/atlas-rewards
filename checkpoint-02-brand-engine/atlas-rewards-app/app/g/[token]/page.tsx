/**
 * /g/<token> — CP-137
 *
 * The page a parent or guardian lands on from the email. Deliberately NOT
 * under /<business>/: it is opened by someone who has no account here, on a
 * device that has never seen the app, so it must not sit behind the customer
 * app's auth or the subdomain rewrite (see middleware.ts).
 *
 * The token is the whole capability. It names one member, one waiver and one
 * version; get_guardian_request() is what decides whether it is still good.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GuardianSignClient, type GuardianRequest } from "@/components/customer/guardian-sign-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign a waiver", robots: { index: false, follow: false } };

export default async function GuardianSignPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_guardian_request", { p_token: params.token });
  const row = (Array.isArray(data) ? data[0] : data) as GuardianRequest | null;
  if (!row) notFound();

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="max-w-md mx-auto">
        <GuardianSignClient request={row} token={params.token} />
      </div>
    </div>
  );
}
