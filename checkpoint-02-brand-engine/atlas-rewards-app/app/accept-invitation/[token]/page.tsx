/**
 * /accept-invitation/[token] — CP-31
 *
 * Public landing page invitees arrive at after clicking the magic-link
 * email. Server component: if not signed in, redirect to /login with a
 * `next` param so they come back here after auth. If signed in, render
 * the client component that calls the accept_invitation RPC and routes
 * the user to the right dashboard on success.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvitationClient } from "./accept-invitation-client";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Bounce to login, then come back here. The login page already preserves
    // the `next` query param.
    redirect(`/login?next=/accept-invitation/${encodeURIComponent(params.token)}`);
  }

  // Pre-fetch the invitation so we can show a friendly "this invite is for
  // <email>" header even before clicking Accept. We use the same RPC the
  // client uses, but read-only — we don't accept on the server in case the
  // user wants to bail or switch accounts.
  // (We deliberately don't surface invite contents publicly; the read is
  // RLS-gated to the inviter and admins. The accept RPC itself proves the
  // user has access to the email it was sent to.)

  return <AcceptInvitationClient token={params.token} userEmail={user.email ?? ""} />;
}
