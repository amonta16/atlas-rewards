import { PrivacyChoices } from "@/components/legal/privacy-choices";

export const metadata = {
  title: "Privacy Policy — Atlas Engine",
  description: "How Atlas Engine collects, uses, and protects your data.",
};

/**
 * Privacy Policy. CP-242 (2026-11-10): rewritten to match what the apps do
 * today: med spa patient apps (memberships, Shop, care history, AI skin
 * scan), the marketing funnels and instant app previews, every processor,
 * cookies / the Meta Pixel, and California privacy choices.
 *
 * NOTE: a sensible default for a B2B2C SaaS, not legal advice. Have a lawyer
 * review before relying on it (health-adjacent data, biometric laws, CCPA).
 */
export default function PrivacyPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-zinc-500">Last updated: November 10, 2026</p>

      <p className="mt-4 leading-relaxed">
        Atlas Engine (&quot;Atlas,&quot; &quot;we,&quot; &quot;us&quot;) makes branded apps for local businesses: rewards
        apps for venues, and patient apps and a front desk for med spas. This policy covers those apps (including{" "}
        <em>med.atlas-engine.app</em> and each business&apos;s own app), our website and sign-up pages at{" "}
        <em>atlas-engine.app</em>, and the instant app previews we build for businesses. It explains what we collect, how
        we use it, and your choices.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">1. Who controls your data</h2>
      <p>
        When you use a business&apos;s app (for example your med spa&apos;s app), that <strong>business</strong> controls
        your customer or patient profile. Atlas is its service provider (&quot;processor&quot;): we store and process the
        data to run the app on the business&apos;s behalf. For our own website, sign-up pages, previews and sales
        conversations, Atlas controls the data.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">2. What we collect</h2>
      <p className="font-semibold">In a business&apos;s app (customers and patients)</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Account info</strong>: name, phone number, email, date of birth (if the business asks).</li>
        <li><strong>Rewards activity</strong>: visits and check-ins, points, rewards and offers, referrals, reviews you submit.</li>
        <li>
          <strong>Purchases</strong>: memberships, packages, products and gift cards you buy in the app, and your
          payment status. Card numbers are entered with Stripe and never reach us.
        </li>
        <li>
          <strong>Care history (med spas)</strong>: treatments the clinic logs for you, the provider, dates, notes,
          aftercare and when you&apos;re due again. This can be health-related information. It is visible to you and the
          clinic only.
        </li>
        <li>
          <strong>AI skin scan (med spas, optional)</strong>: if you choose to scan, your selfie is analyzed by our
          processor and, if you&apos;re signed in, your scores are saved. See the{" "}
          <a href="/legal/ai-skin-scan" className="underline">AI Skin Scan &amp; Biometric Notice</a> for exactly what
          happens; Atlas does not store your photo.
        </li>
        <li><strong>Notification settings</strong> and a push-subscription identifier if you turn on notifications.</li>
      </ul>
      <p className="font-semibold">On our website, sign-up pages and app previews (business owners)</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          What you enter: your name, email, phone, practice or business name and website, and your answers to our
          questions.
        </li>
        <li>
          Public information about your business that we look up to build your free app preview: your website&apos;s
          text, logo, colors, photos and services, and your public Google business listing (address, hours, phone,
          reviews). An AI model (Anthropic&apos;s Claude) reads your website to fill in the preview.
        </li>
        <li>Calls you book with us (time, and the meeting link).</li>
      </ul>
      <p className="font-semibold">Everywhere</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Usage logs</strong>: IP address, browser, timestamp and page, kept up to 30 days for security and debugging.</li>
        <li><strong>Cookies</strong>: see section 6.</li>
      </ul>

      <p className="mt-3">
        <strong>Camera.</strong> Apps use your camera only when you choose to: to scan a QR code (join, check in, or the
        front desk scanning your code), or to take a selfie for the AI skin scan. QR scanning happens on your device and
        nothing is recorded. Skin scan photos are handled as described in the{" "}
        <a href="/legal/ai-skin-scan" className="underline">skin scan notice</a>. You can always decline camera access.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">3. What we do NOT do</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>We don&apos;t sell personal information, and we never sell, rent or trade face or health information.</li>
        <li>We don&apos;t store payment card numbers (Stripe does).</li>
        <li>We don&apos;t track your location in customer or patient apps.</li>
        <li>Customer and patient apps don&apos;t contain advertising trackers.</li>
        <li>We don&apos;t use your photos, health information or customer data to train AI models.</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">4. How we use it</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>To run the app for the business you signed up with: rewards, purchases, bookings, care reminders, the skin scan.</li>
        <li>To send the texts, emails and notifications you asked for or agreed to.</li>
        <li>To give businesses their dashboards and reports (mostly totals and trends; staff can see their own customers).</li>
        <li>To build and send the app preview a business owner requested, and to follow up about it.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">5. Who can see your data</h2>
      <p>
        <strong>Inside Atlas:</strong> only the business you signed up with (owners, managers and the staff they invite).
        Other businesses can&apos;t see it. Atlas staff access individual records only to provide support or keep the
        service running.
      </p>
      <p>
        <strong>Service providers</strong> who process data for us, only to provide their service and not for their own
        purposes:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Supabase (database, sign-in) and Vercel (hosting).</li>
        <li>Stripe (payments; Klarna and Affirm if you choose pay-over-time, under their own terms).</li>
        <li>Twilio (text messages) and Resend (email).</li>
        <li>Google (Firebase push notifications, Calendar and Meet for booked calls, Maps on clinic pages, public business listings, web fonts) and Apple (push notifications).</li>
        <li>Perfect Corp. / YouCam (AI skin analysis and previews; see the <a href="/legal/ai-skin-scan" className="underline">notice</a>).</li>
        <li>Anthropic (reads a business&apos;s public website to build its app preview; no customer or patient data).</li>
        <li>Meta (only if we run ads for Atlas; see section 6).</li>
      </ul>
      <p>
        We may also disclose information if the law requires it, to protect people&apos;s safety, or as part of a merger
        or sale of our business (with this policy still applying).
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2" id="cookies">6. Cookies and tracking</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Essential cookies</strong> keep you signed in and remember your choices. The apps need them to work.</li>
        <li>
          <strong>Advertising (our marketing website only).</strong> To measure our own ads, some pages on{" "}
          <em>atlas-engine.app</em> for business owners may use the Meta Pixel, which lets Meta see that you visited and
          whether you booked a call. It is never used in customer or patient apps. Under California law this can count
          as &quot;sharing&quot; for advertising; you can opt out below.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2" id="choices">7. Your privacy choices</h2>
      <p>
        <strong>Do Not Sell or Share My Personal Information.</strong> We don&apos;t sell personal information. To opt
        out of advertising &quot;sharing&quot; on our website, use the button below. We also honor{" "}
        <strong>Global Privacy Control</strong> (GPC) signals automatically.
      </p>
      <PrivacyChoices />

      <h2 className="text-xl font-bold mt-10 mb-2">8. Your rights</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          <strong>Delete your account</strong>: in the app, Profile → Delete account. This removes your profile and every
          membership across businesses on Atlas, including saved skin scans.
        </li>
        <li>
          <strong>Access, correct, export or delete</strong>: email{" "}
          <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a>. We respond within 30
          days. If your request is about a business&apos;s app, we may pass it to that business, which controls your
          profile.
        </li>
        <li><strong>Notifications</strong>: turn them off in Profile or your phone&apos;s settings.</li>
        <li>
          <strong>California, EU/UK and other state residents</strong> have additional rights (know, delete, correct,
          limit use of sensitive information, opt out of sharing, appeal a decision). We use sensitive information (such
          as health or face data) only to provide the service you asked for. We won&apos;t treat you differently for using
          your rights. You can use an authorized agent.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">9. Health information</h2>
      <p>
        Atlas is not a healthcare provider. Med spas use Atlas to run their patient app; the clinic is responsible for
        the care it provides and for its own obligations under health-privacy laws such as HIPAA where they apply. We
        handle care history and skin scan results only to run the app for that clinic and keep them visible only to you
        and the clinic.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2" id="sms">10. Text messages (SMS)</h2>
      <p>
        If you give us your mobile number and agree to receive texts from Atlas Engine (for example when you request a
        preview of your practice&apos;s app at atlas-engine.app/medspa/app, or when you text us first), we use it only to
        send you the messages you asked for. Informational texts (your app preview link, answers to your questions,
        reminders for calls you booked) and marketing texts (offers and promotions about Atlas Engine) are agreed to
        separately, and we only send the kind you opted in to. Message frequency varies. Message and data rates may apply. Reply
        STOP to opt out at any time, or HELP for help.
      </p>
      <p className="mt-3">
        <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional
        purposes.</strong> Text messaging originator opt-in data and consent will not be shared with any third parties,
        except the providers that deliver the messages for us (such as our SMS carrier) and only to send them.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">11. Retention</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>App data: while your account is active. After you delete your account, personal data is removed within 30 days; backups roll off within 90 days.</li>
        <li>Skin scan photos: not stored by Atlas (see the <a href="/legal/ai-skin-scan" className="underline">notice</a> for our processor&apos;s schedule).</li>
        <li>App previews and sales contacts: previews expire after 14 days; contact details are kept while we&apos;re in touch, and deleted on request.</li>
        <li>Usage logs: up to 30 days.</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">12. Security</h2>
      <p>
        Data is encrypted in transit, access is limited by role (each business sees only its own data), and payment
        details stay with Stripe. No system is perfectly secure; if a breach affects you, we&apos;ll tell you as the law
        requires.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">13. Children</h2>
      <p>
        Atlas isn&apos;t for children under 13, and med spa patient apps and the AI skin scan are for adults 18 and older.
        We don&apos;t knowingly collect data from children. If you believe we have, email us and we&apos;ll delete it.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">14. Changes</h2>
      <p>
        We&apos;ll update the date above when this policy changes. Material changes will be announced in the app at least
        14 days before they take effect.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">15. Contact</h2>
      <p>
        Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a> with any privacy
        question or request.
      </p>
    </article>
  );
}
