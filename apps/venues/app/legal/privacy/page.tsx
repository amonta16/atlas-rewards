export const metadata = {
  title: "Privacy Policy — Atlas Engine",
  description: "How Atlas Engine collects, uses, and protects your data.",
};

/**
 * Privacy Policy — last revised 2026-05-31.
 *
 * NOTE: This is a sensible default for a B2B2C loyalty SaaS. Before
 * commercial launch you should have a lawyer review (especially the
 * CCPA / GDPR sections if you have California or EU users).
 */
export default function PrivacyPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-zinc-500">Last updated: July 21, 2026</p>

      <p className="mt-4 leading-relaxed">
        Atlas Engine ("Atlas," "we," "us") provides a white-label customer
        loyalty platform to local businesses. This policy explains what
        information we collect, how we use it, and what choices you have.
      </p>

      <h2 className="text-xl font-bold mt-8">1. Who controls your data</h2>
      <p>
        When a customer signs up for a loyalty program at a business that uses
        Atlas, the BUSINESS is the data controller for that customer's loyalty
        profile. Atlas is the data processor — we store and process the data on
        the business's behalf under our processor agreement with them.
      </p>

      <h2 className="text-xl font-bold mt-8">2. What we collect</h2>
      <ul>
        <li><strong>Account info</strong> — your email, name, phone (optional), and date of birth.</li>
        <li><strong>Loyalty activity</strong> — visits, points awarded, redemptions, reviews you've submitted, offers you've claimed.</li>
        <li><strong>Notification preferences</strong> — whether you've opted into push notifications.</li>
        <li><strong>Device info</strong> — when you install the app (from the App Store, Google Play, or as a PWA) and opt into notifications, we store a push-subscription identifier so we can deliver them.</li>
        <li><strong>Usage logs</strong> — basic request logs (IP, timestamp, route) kept for 30 days for abuse prevention.</li>
      </ul>

      <p className="mt-3">
        <strong>Camera.</strong> The mobile app uses your device's camera for
        one purpose only: scanning a business's QR code to join or check in.
        Scanning happens entirely on your device — no photos or video are
        recorded, stored, or sent to our servers. You can decline the camera
        permission and join with a code instead.
      </p>

      <h2 className="text-xl font-bold mt-8">3. What we do NOT collect</h2>
      <ul>
        <li>Payment card numbers (handled by Stripe directly).</li>
        <li>Your location.</li>
        <li>Third-party advertising identifiers. We don't run ads.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8">4. How we use it</h2>
      <ul>
        <li>To run the loyalty program for the business you signed up with.</li>
        <li>To send the notifications you've opted into (rewards unlocked, offers, reminders).</li>
        <li>To compute aggregated, anonymized metrics for the business's "Insights" dashboard.</li>
        <li>To prevent abuse and debug issues.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8">5. Who can see your data</h2>
      <p>
        <strong>Inside Atlas:</strong> only employees of the business you
        signed up with — owners, managers, and front-desk staff they invited.
        Other businesses on Atlas cannot see your data. Atlas's own staff only
        access individual records to provide support when you ask us to.
      </p>
      <p>
        <strong>Subprocessors:</strong> we use Supabase (database + auth),
        Vercel (hosting), Stripe (payments), and a web-push provider
        (Apple/Google) to deliver notifications. None of them have permission
        to use your data for their own purposes.
      </p>

      <h2 className="text-xl font-bold mt-8">6. Your rights</h2>
      <ul>
        <li>
          <strong>Delete your account.</strong> Open the app → Profile → Delete
          account. Removes your profile, every membership, and your auth row
          across all businesses. Some aggregated metrics (like "total members")
          may retain a count after your row is gone.
        </li>
        <li>
          <strong>Export your data.</strong> Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a> and we'll send you a JSON file within 30 days.
        </li>
        <li>
          <strong>Turn off notifications.</strong> Profile tab → Notification preferences.
        </li>
        <li>
          <strong>EU / UK / California residents</strong> have additional GDPR / CCPA rights (access, rectification, restriction of processing). Email us — we honor all of them.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-8">7. Retention</h2>
      <p>
        We keep your loyalty data while your account is active. If you delete
        your account, all personally identifiable data is removed within 30 days
        (the lag is to give us time to process any pending refunds or disputes).
        Backups are rotated within 90 days.
      </p>

      <h2 className="text-xl font-bold mt-8">8. Children</h2>
      <p>
        Atlas isn't designed for children under 13. We don't knowingly collect
        data from anyone under 13. If you believe we have, email us and we'll
        delete it.
      </p>

      <h2 className="text-xl font-bold mt-8">9. Changes</h2>
      <p>
        We'll post the date this policy was last updated above. Material changes
        will be announced in-app at least 14 days before they take effect.
      </p>

      <h2 className="text-xl font-bold mt-8">10. Contact</h2>
      <p>
        Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a> with any privacy question.
      </p>
    </article>
  );
}
