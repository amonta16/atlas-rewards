"use client";
/**
 * DeleteAccountSection — CP-40
 *
 * Customer-facing "delete my account" widget that lives at the bottom
 * of the Profile tab. Opens the standard type-DELETE confirmation
 * modal, calls the delete_my_account() RPC, signs the user out, and
 * redirects to /signup.
 *
 * Intentionally placed at the BOTTOM of the profile (below all the
 * editable fields) so it's discoverable but not in the way.
 */
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { Business } from "@/lib/types/database";

export function DeleteAccountSection({ business }: { business: Business }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function performDelete() {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_my_account");
    if (error) throw new Error(error.message);
    // Auth row is gone; sign out the local session anyway to clear cookies.
    await supabase.auth.signOut();
    router.push(`/signup`);
    router.refresh();
  }

  return (
    <div className="mt-10 px-4 pb-10">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
            <Trash2 className="h-5 w-5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-rose-900">Delete account</div>
            <p className="text-xs text-rose-800 mt-1 leading-snug">
              Removes your profile, every membership across {business.name} businesses,
              and your points history. Can't be undone.
            </p>
            <button
              onClick={() => setOpen(true)}
              className="mt-3 text-xs font-bold text-rose-700 hover:text-rose-900 underline"
            >
              Delete my account →
            </button>
          </div>
        </div>
      </div>

      {open && (
        <ConfirmDeleteModal
          title="Delete your account?"
          description="This permanently removes your profile, every membership, your points, redemptions, and reviews."
          confirmWord="DELETE"
          destructiveLabel="Delete my account"
          onClose={() => setOpen(false)}
          onConfirm={performDelete}
        />
      )}
    </div>
  );
}
