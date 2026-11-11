export const metadata = {
  title: "Consumer Health Data Privacy Policy — Atlas Engine",
  description: "How Atlas Engine handles consumer health data (Washington My Health My Data Act, Nevada SB 370 and similar laws).",
};

/**
 * CP-242: the separate consumer health data policy Washington's My Health My
 * Data Act requires (linked from the homepage), also covering Nevada SB 370
 * and similar laws. Have counsel review.
 */
export default function HealthDataPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">Consumer Health Data Privacy Policy</h1>
      <p className="text-sm text-zinc-500">Last updated: November 10, 2026</p>

      <p className="mt-4 leading-relaxed">
        This policy applies to &quot;consumer health data&quot; under Washington&apos;s My Health My Data Act, Nevada SB
        370 and similar state laws. It adds to our <a href="/legal/privacy" className="underline">Privacy Policy</a>.
        Where a med spa or clinic uses Atlas to run its patient app, Atlas processes this data on the clinic&apos;s
        behalf and under its instructions.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">1. What consumer health data we handle</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Treatments a clinic logs for you, dates, provider, notes, aftercare and when you&apos;re due again.</li>
        <li>Treatments, packages and memberships you buy or show interest in.</li>
        <li>AI skin scan results (scores, areas to improve, matched treatments) and the goals you pick.</li>
        <li>Face and skin analysis from a skin scan selfie (biometric data; Atlas doesn&apos;t store the photo).</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">2. Where it comes from</h2>
      <p>From you (what you enter, buy or scan) and from your clinic (what it logs about your visits).</p>

      <h2 className="text-xl font-bold mt-10 mb-2">3. Why we use it</h2>
      <p>
        Only to provide what you asked for: your care history and reminders, purchases, your skin scan and the
        clinic&apos;s follow-up, plus keeping the service secure. We collect and share consumer health data only with your
        consent or as necessary to provide the service you requested. We don&apos;t sell it, use it for advertising, or
        use it to train AI models.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">4. Who we share it with</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>The clinic whose app you use.</li>
        <li>Processors that run the service for us: Supabase (database), Vercel (hosting), Perfect Corp. (skin analysis), Twilio and Resend (messages you agreed to), Stripe (payments).</li>
        <li>Authorities, if the law requires it.</li>
      </ul>
      <p>We don&apos;t share it with any affiliates.</p>

      <h2 className="text-xl font-bold mt-10 mb-2">5. Your rights</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Confirm whether we collect, share or sell your consumer health data (we don&apos;t sell it).</li>
        <li>Access it, including a list of the third parties and affiliates we&apos;ve shared it with.</li>
        <li>Withdraw your consent.</li>
        <li>Have it deleted (including from our archives and backups as they roll over).</li>
      </ul>
      <p>
        Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a>, or delete your
        account in the app (Profile → Delete account). We respond within 45 days. If we refuse a request, you can appeal by
        replying to our decision; we&apos;ll answer within 45 days. If the appeal is denied, Washington residents may
        contact the Washington Attorney General and Nevada residents the Nevada Attorney General.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">6. Contact</h2>
      <p>
        <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a>
      </p>
    </article>
  );
}
