export const metadata = {
  title: "Terms of Service — Atlas Engine",
  description: "The rules for using Atlas Engine.",
};

export default function TermsPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-zinc-500">Last updated: May 31, 2026</p>

      <p className="mt-4 leading-relaxed">
        By using Atlas Engine ("Atlas," "we," "us"), you agree to these terms.
        Read them. If you don't agree, don't use the service.
      </p>

      <h2 className="text-xl font-bold mt-8">1. Who can use Atlas</h2>
      <ul>
        <li>You must be 13 or older to create a customer account.</li>
        <li>You must be 18 or older to create or operate a business account.</li>
        <li>You're responsible for everything that happens under your login.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8">2. Two account types</h2>
      <p>
        <strong>Customers</strong> earn points, claim offers, and redeem rewards at participating businesses.
      </p>
      <p>
        <strong>Businesses</strong> run the loyalty program — they invite staff, configure rewards, broadcast offers, and have full control over their customer list. Businesses pay Atlas a monthly fee for the service; see your invoice for current pricing.
      </p>

      <h2 className="text-xl font-bold mt-8">3. Your data, your control</h2>
      <p>
        See our <a href="/legal/privacy" className="underline">Privacy Policy</a> for how data is handled. Short version: businesses control their customer data; Atlas hosts and processes it for them.
      </p>

      <h2 className="text-xl font-bold mt-8">4. Acceptable use</h2>
      <p>You may NOT:</p>
      <ul>
        <li>Use Atlas for anything illegal in your jurisdiction.</li>
        <li>Try to break into the system, reverse-engineer it, or interfere with other users.</li>
        <li>Send spam, phishing, or harassment via Atlas notifications.</li>
        <li>Resell, sublicense, or white-label Atlas without a written agreement.</li>
        <li>Scrape or bulk-export customer data (you can export YOUR business's data anytime — that's fine).</li>
      </ul>

      <h2 className="text-xl font-bold mt-8">5. Business obligations</h2>
      <p>If you operate a business on Atlas, you agree to:</p>
      <ul>
        <li>Honor every reward and redemption your customers earn fairly.</li>
        <li>Get appropriate consent before adding customers to your loyalty program.</li>
        <li>Send notifications only to customers who've opted in.</li>
        <li>Comply with all consumer-protection laws (truth in advertising, gift card regulations, etc.) that apply to your locality.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8">6. Payments + refunds</h2>
      <p>
        Business subscriptions are billed monthly via Stripe. You can cancel
        anytime from the Billing tab — you'll keep access through the current
        billing period, no refund for partial months. Refund requests for clear
        billing errors are honored.
      </p>

      <h2 className="text-xl font-bold mt-8">7. Service availability</h2>
      <p>
        Atlas is provided "as is." We aim for high uptime but don't guarantee
        zero downtime. Scheduled maintenance will be announced in advance.
        We're not liable for indirect or consequential damages arising from
        service interruptions.
      </p>

      <h2 className="text-xl font-bold mt-8">8. Termination</h2>
      <p>
        Either of us can terminate at any time. If we terminate your account
        for cause (abuse, non-payment, breach of these terms), you forfeit
        access. If you terminate, you can export your data first via the
        Profile tab → Delete account → Export.
      </p>

      <h2 className="text-xl font-bold mt-8">9. Liability cap</h2>
      <p>
        Atlas's total liability to you for any claim relating to the service is
        capped at the amount you paid us in the previous 12 months, or $100,
        whichever is greater.
      </p>

      <h2 className="text-xl font-bold mt-8">10. Governing law</h2>
      <p>
        These terms are governed by the laws of California, USA. Disputes go
        through binding arbitration in San Diego County, unless you opt out of
        arbitration within 30 days of signup by emailing us.
      </p>

      <h2 className="text-xl font-bold mt-8">11. Changes</h2>
      <p>
        We can update these terms. Material changes will be announced in-app at
        least 14 days before they take effect. Continued use after the effective
        date means you accept the new terms.
      </p>

      <h2 className="text-xl font-bold mt-8">12. Contact</h2>
      <p>
        Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a>.
      </p>
    </article>
  );
}
