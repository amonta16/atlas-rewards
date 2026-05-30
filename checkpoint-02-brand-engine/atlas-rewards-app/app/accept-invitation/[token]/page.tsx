/**
 * /accept-invitation/[token] — CP-41
 *
 * Public landing for invite links. Three branches:
 *
 *   1. NOT signed in → render signup form with the invited email pre-
 *      filled + locked. Invitee sets their own password, account is
 *      created, accept_invitation fires automatically, route to
 *      dashboard.
 *   2. Signed in + email matches the invite → render "Accept" button.
 *   3. Signed in + email doesn't match → show "sign out + restart"
 *      with a clear message about which email is needed.
 *
 * Server-renders the invitation metadata via preview_invitation() RPC
 * (public — token is the auth).
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvitationClient } from "./accept-invitation-client";

export const dynamic = "force-dynamic";

type Preview = {
  email: string;
  role: "agency_admin" | "business_manager" | "business_staff";
  business_id: string | null;
  business_name: string | null;
  expires_at: string;
  is_expired: boolean;
  is_accepted: boolean;
  is_revoked: boolean;
};

export default async function AcceptInvitationPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();

  // Fetch invite metadata via preview_invitation RPC. Public-readable
  // by token holders so we can render the signup form without auth.
  const { data: previewData } = await supabase.rpc("preview_invitation", {
    p_token: params.token,
  });
  const preview = (Array.isArray(previewData) ? previewData[0] : previewData) as Preview | null;

  if (!preview) notFound();

  // Check current auth state — we pass this to the client so it knows
  // which branch to render.
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <AcceptInvitationClient
      token={params.token}
      preview={preview}
      signedInEmail={user?.email ?? null}
    />
  );
}
