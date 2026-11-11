export const metadata = {
  title: "Terms of Service — Atlas Engine",
  description: "The rules for using Atlas Engine.",
};

export default function TermsPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-zinc-500">Last updated: November 10, 2026</p>

      <p className="mt-4 leading-relaxed">
        By using Atlas Engine ("Atlas," "we," "us"), you agree to these terms.
        Read them. If you don't agree, don't use the service.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">1. Who can use Atlas</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>You must be 13 or older to create a customer account, and 18 or older to use a med spa patient app or the AI skin scan.</li>
        <li>You must be 18 or older to create or operate a business account.</li>
        <li>You're responsible for everything that happens under your login.</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">2. Two account types</h2>
      <p>
        <strong>Customers</strong> earn points, claim offers, and redeem rewards at participating businesses.
      </p>
      <p>
        <strong>Businesses</strong> (including med spas) run the program — they invite staff, configure rewards, broadcast offers, and have full control over their customer list. Businesses pay Atlas a monthly fee for the service; see your invoice for current pricing.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">3. Your data, your control</h2>
      <p>
        See our <a href="/legal/privacy" className="underline">Privacy Policy</a> for how data is handled. Short version: businesses control their customer data; Atlas hosts and processes it for them.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">4. Acceptable use</h2>
      <p>You may NOT:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Use Atlas for anything illegal in your jurisdiction.</li>
        <li>Try to break into the system, reverse-engineer it, or interfere with other users.</li>
        <li>Send spam, phishing, or harassment via Atlas notifications.</li>
        <li>Resell, sublicense, or white-label Atlas without a written agreement.</li>
        <li>Scrape or bulk-export customer data (you can export YOUR business's data anytime — that's fine).</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">5. Business obligations</h2>
      <p>If you operate a business on Atlas, you agree to:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Honor every reward and redemption your customers earn fairly.</li>
        <li>Get appropriate consent before adding customers to your loyalty program.</li>
        <li>Send notifications only to customers who've opted in.</li>
        <li>Comply with all consumer-protection laws (truth in advertising, gift card regulations, etc.) that apply to your locality.</li>
        <li>Only upload content you have the right to use (logos, photos, before/after images, reviews, testimonials), with any patient consent the law requires.</li>
        <li>
          <strong>Med spas and other health businesses:</strong> you are solely responsible for the treatments you offer and
          perform, your licensing and supervision, your prices, memberships and refund policy, your claims about results
          (including before/after photos and testimonials, which must be truthful and typical or clearly qualified), and
          your own obligations under HIPAA and state health-privacy laws. Don&apos;t enter more health information into
          Atlas than you need to run your patient app.
        </li>
        <li>
          If you turn on the AI skin scan, you agree that it&apos;s a cosmetic, informational tool: you won&apos;t present
          its scores or previews as a diagnosis or a promise of results, and you&apos;ll only use saved scans to help the
          patient who saved them.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">6. Payments + refunds</h2>
      <p>
        Business subscriptions are billed monthly via Stripe. You can cancel
        anytime from the Billing tab — you'll keep access through the current
        billing period, no refund for partial months. Refund requests for clear
        billing errors are honored.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2" id="sms">6a. Text message program</h2>
      <p>
        <strong>Atlas Engine app previews and updates.</strong> When you request a preview of your practice&apos;s app you
        can tick two separate, optional boxes. The first (or texting our number first) means you agree to receive
        informational texts: your preview link, answers to your questions and reminders for calls you booked; frequency
        varies. The second means you also agree to receive occasional marketing texts with offers and promotions about
        Atlas Engine, up to 4 a month. You can agree to one, both or neither. Message and data rates may apply. Consent
        is not a condition of purchase.
      </p>
      <ul className="list-disc pl-6 mt-3 space-y-1">
        <li>Reply <strong>STOP</strong> to cancel at any time. You&apos;ll get one message confirming you&apos;re unsubscribed.</li>
        <li>Reply <strong>HELP</strong> for help, or email <a href="mailto:andrew@atlas-engine.app" className="underline">andrew@atlas-engine.app</a>.</li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
        <li>How we handle your number: see our <a href="/legal/privacy#sms" className="underline">Privacy Policy</a>.</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2" id="health">6b. Health, AI features and results</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          <strong>Not medical advice.</strong> Atlas is software, not a healthcare provider. Nothing in Atlas or a
          business&apos;s app (treatment descriptions, aftercare, reminders, skin scores, AI previews or recommendations)
          is medical advice, a diagnosis or a substitute for a licensed provider. Treatment decisions are between you and
          your provider.
        </li>
        <li>
          <strong>AI skin scan and previews.</strong> Scores are estimates from a photo and can be affected by lighting,
          makeup and camera. &quot;After&quot; images are AI simulations, not photos of real results, and not a promise or
          guarantee of any outcome. Real results vary. See the{" "}
          <a href="/legal/ai-skin-scan" className="underline">AI Skin Scan &amp; Biometric Notice</a>.
        </li>
        <li>
          <strong>Purchases from a business.</strong> When you buy a membership, package, product or gift card in a
          business&apos;s app, you&apos;re buying from that business, under its prices and refund policy. Atlas processes
          the payment for the business through Stripe. Pay-over-time (Klarna, Affirm) is offered under those
          providers&apos; own terms. Treatments, bookings, results and refunds are the business&apos;s responsibility.
        </li>
        <li>
          <strong>Example content.</strong> Demo apps and instant previews use example treatments, prices, photos and
          reviews to show what an app could look like. They aren&apos;t offers from a real clinic.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">6c. Your content</h2>
      <p>
        You keep ownership of what you upload. You give Atlas permission to host, copy and display it only to run the
        service for you. You&apos;re responsible for having the rights to it.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">7. Service availability</h2>
      <p>
        Atlas is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, including
        merchantability, fitness for a particular purpose, accuracy of AI output, and non-infringement, to the extent the
        law allows. We aim for high uptime but don&apos;t guarantee zero downtime. Scheduled maintenance will be
        announced in advance. We&apos;re not liable for indirect, incidental, special or consequential damages, or for
        lost profits or data, arising from the service or its interruption.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">8. Termination</h2>
      <p>
        Either of us can terminate at any time. If we terminate your account
        for cause (abuse, non-payment, breach of these terms), you forfeit
        access. If you terminate, you can export your data first via the
        Profile tab → Delete account → Export.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">9. Liability cap</h2>
      <p>
        Atlas's total liability to you for any claim relating to the service is
        capped at the amount you paid us in the previous 12 months, or $100,
        whichever is greater.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">9a. Indemnity</h2>
      <p>
        Businesses agree to defend and indemnify Atlas against claims arising from their products, services and
        treatments, their content and marketing claims, their use of customer and patient data, and their breach of
        these terms or the law.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">10. Governing law</h2>
      <p>
        These terms are governed by the laws of California, USA. Disputes go
        through binding arbitration in San Diego County, unless you opt out of
        arbitration within 30 days of signup by emailing us.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">11. Changes</h2>
      <p>
        We can update these terms. Material changes will be announced in-app at
        least 14 days before they take effect. Continued use after the effective
        date means you accept the new terms.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">12. Contact</h2>
      <p>
        Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a>.
      </p>
    </article>
  );
}
