import Link from "next/link";
import { Trash2, Smartphone, Mail, ShieldCheck } from "lucide-react";

/**
 * CP-75: Public account-deletion info page.
 *
 * Google Play's Data safety form requires a public URL describing how
 * users can request account deletion (even though deletion is available
 * in-app); Apple reviewers also look for it. Lives on the apex domain:
 *   https://<root-domain>/account/delete
 * Put this URL in the Play Data safety form and in the privacy policy.
 */

export const metadata = {
  title: "Delete your account — Atlas Rewards",
  description: "How to delete your Atlas Rewards account and what happens to your data.",
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "andrewmontano619@gmail.com";

export default function AccountDeletePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-white px-6 py-14">
      <div className="max-w-xl mx-auto">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mb-5">
          <Trash2 className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Delete your Atlas Rewards account</h1>
        <p className="text-zinc-500 mt-3">
          You can permanently delete your account and its data at any time. Deletion is immediate
          and can&apos;t be undone.
        </p>

        <section className="mt-8 rounded-3xl border bg-white p-6">
          <div className="flex items-center gap-3 mb-3">
            <Smartphone className="h-5 w-5 text-cyan-600" />
            <h2 className="font-bold text-zinc-900">In the app (fastest)</h2>
          </div>
          <ol className="list-decimal list-inside text-sm text-zinc-600 space-y-1.5">
            <li>Open the app and sign in.</li>
            <li>Go to the <span className="font-semibold">Profile</span> tab.</li>
            <li>Scroll to the bottom and tap <span className="font-semibold">Delete my account</span>.</li>
            <li>Type DELETE to confirm.</li>
          </ol>
        </section>

        <section className="mt-4 rounded-3xl border bg-white p-6">
          <div className="flex items-center gap-3 mb-3">
            <Mail className="h-5 w-5 text-cyan-600" />
            <h2 className="font-bold text-zinc-900">By email</h2>
          </div>
          <p className="text-sm text-zinc-600">
            Can&apos;t access the app? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20Atlas%20Rewards%20account`} className="font-semibold text-cyan-700 underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            from the address on your account with the subject &quot;Delete my account&quot;.
            We verify it&apos;s you and complete the deletion within 30 days.
          </p>
        </section>

        <section className="mt-4 rounded-3xl border bg-white p-6">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className="h-5 w-5 text-cyan-600" />
            <h2 className="font-bold text-zinc-900">What gets deleted</h2>
          </div>
          <p className="text-sm text-zinc-600">
            Your profile (name, email, phone, birthday), your memberships at every participating
            business, your points balance and history, saved offers, redemptions, streaks, and
            notification subscriptions. Businesses keep only anonymized, aggregate statistics that
            no longer identify you. Points and unredeemed rewards are forfeited and can&apos;t be restored.
          </p>
          <p className="text-sm text-zinc-500 mt-3">
            Details in our{" "}
            <Link href="/legal/privacy" className="font-semibold text-cyan-700 underline">privacy policy</Link>.
          </p>
        </section>

        <p className="text-[11px] text-zinc-400 mt-8 text-center">Powered by Atlas Rewards</p>
      </div>
    </main>
  );
}
