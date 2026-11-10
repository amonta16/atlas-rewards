export const metadata = {
  title: "Notice to California Residents — Atlas Engine",
  description: "California (CCPA/CPRA) privacy disclosures for Atlas Engine.",
};

/**
 * CP-242: CCPA/CPRA notice at collection + annual disclosures. Supplements
 * /legal/privacy. Categories follow Cal. Civ. Code § 1798.140. Have counsel
 * review, and re-check every 12 months (the law requires an annual update).
 */
const CATEGORIES: { cat: string; examples: string; sources: string; to: string }[] = [
  { cat: "A. Identifiers", examples: "Name, email, phone number, account ID, IP address, push-notification ID", sources: "You; your device; the business whose app you use", to: "That business; service providers" },
  { cat: "B. Customer records (Cal. Civ. Code § 1798.80)", examples: "Name, phone, email, payment status (card numbers stay with Stripe)", sources: "You; the business; Stripe", to: "That business; service providers" },
  { cat: "C. Protected characteristics", examples: "Date of birth / age, if the business asks for it", sources: "You", to: "That business; service providers" },
  { cat: "D. Commercial information", examples: "Memberships, packages, purchases, gift cards, points, rewards, offers, referrals", sources: "You; the business", to: "That business; service providers" },
  { cat: "E. Biometric information", examples: "Face and skin analysis of a selfie for the optional AI skin scan (Atlas doesn't store the photo)", sources: "You", to: "Our skin-analysis processor (Perfect Corp.)" },
  { cat: "F. Internet or network activity", examples: "Pages viewed, app activity, usage logs; on our marketing site, a visit counter and (if you allow) Meta's pixel", sources: "Your device", to: "Service providers; Meta, only if you allow advertising cookies" },
  { cat: "G. Geolocation", examples: "Approximate country from your IP address (for security and cookie rules). No precise location in customer or patient apps", sources: "Your device", to: "Service providers" },
  { cat: "H. Sensory information", examples: "Selfies you choose to take or upload for the skin scan; photos businesses upload", sources: "You; the business", to: "Our skin-analysis processor; service providers" },
  { cat: "I. Professional information", examples: "For business owners: business name, role, website, public business listing", sources: "You; public sources (your website, Google)", to: "Service providers" },
  { cat: "K. Inferences", examples: "Skin scores, areas to improve and matched treatments from the skin scan", sources: "Derived from the information above", to: "That business; service providers" },
  { cat: "L. Sensitive personal information", examples: "Health-related information (care history, skin scan results), biometric information", sources: "You; the business", to: "That business; service providers" },
];

export default function CaliforniaNoticePage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">Notice to California Residents</h1>
      <p className="text-sm text-zinc-500">Last updated: November 10, 2026</p>

      <p className="mt-4 leading-relaxed">
        This notice supplements our <a href="/legal/privacy" className="underline">Privacy Policy</a> and applies to
        California residents. It is provided under the California Consumer Privacy Act, as amended by the California
        Privacy Rights Act (the &quot;CCPA&quot;), and is our <strong>notice at collection</strong>. Terms like
        &quot;personal information,&quot; &quot;sell&quot; and &quot;share&quot; mean what the CCPA says they mean.
      </p>
      <p>
        When you use a business&apos;s app on Atlas, that business decides how your information is used and Atlas acts as
        its service provider. Medical information held by a clinic under HIPAA or California&apos;s Confidentiality of
        Medical Information Act may be exempt from the CCPA; requests about those records go to your clinic, and
        we&apos;ll help them respond.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">1. What we collect, where it comes from, and who receives it</h2>
      <p>In the last 12 months we collected these categories:</p>
      <div className="not-prose my-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-left text-[13.5px]">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr><th className="p-3 font-semibold">Category</th><th className="p-3 font-semibold">Examples</th><th className="p-3 font-semibold">Sources</th><th className="p-3 font-semibold">Disclosed for a business purpose to</th></tr>
          </thead>
          <tbody className="divide-y">
            {CATEGORIES.map((c) => (
              <tr key={c.cat} className="align-top"><td className="p-3 font-semibold text-zinc-900">{c.cat}</td><td className="p-3 text-zinc-700">{c.examples}</td><td className="p-3 text-zinc-600">{c.sources}</td><td className="p-3 text-zinc-600">{c.to}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        We don&apos;t collect category J (non-public education information). Retention for each category is described in
        section 11 of the Privacy Policy; skin scan face data follows the schedule in the{" "}
        <a href="/legal/ai-skin-scan" className="underline">AI Skin Scan &amp; Biometric Notice</a>.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">2. Why we collect it</h2>
      <p>
        To provide and run the apps (rewards, memberships, purchases, bookings, care reminders, the skin scan), to send the
        messages you asked for, to support you, to secure the service and prevent fraud, to improve it, to market Atlas to
        businesses, and to comply with law. We won&apos;t use it for materially different purposes without telling you.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">3. Sensitive personal information</h2>
      <p>
        We collect health-related and biometric information only when you choose to use those features (for example,
        consenting to the skin scan, or a clinic logging your treatments), and we use it only to provide the service you
        asked for and for purposes the CCPA regulations allow (such as security and keeping the service working). We
        don&apos;t use it to infer characteristics about you or for advertising, so we don&apos;t need to offer a
        &quot;Limit the Use of My Sensitive Personal Information&quot; link.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">4. Selling and sharing</h2>
      <p>
        We don&apos;t sell personal information. In the last 12 months we have not sold or &quot;shared&quot; (for
        cross-context behavioral advertising) any personal information. If we run ads for Atlas, our marketing website
        (not customer or patient apps) may use Meta&apos;s pixel, which can count as &quot;sharing&quot; identifiers and
        site activity. You can stop that at any time: <a href="/legal/privacy#choices" className="underline">Do Not Sell or Share My Personal Information</a>.
        We honor Global Privacy Control. We have no actual knowledge of selling or sharing information of anyone under 16.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">5. Your rights</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Know / access</strong> the categories and specific pieces of personal information we hold, its sources, purposes, and who we disclose it to.</li>
        <li><strong>Delete</strong> personal information we collected from you.</li>
        <li><strong>Correct</strong> inaccurate personal information.</li>
        <li><strong>Portability</strong>: a copy in a usable format.</li>
        <li><strong>Opt out</strong> of selling or sharing (see section 4).</li>
        <li><strong>Non-discrimination</strong>: we won&apos;t deny service, charge different prices or give lower quality for using your rights.</li>
        <li>
          <strong>Automated decisions</strong>: the skin scan&apos;s output is informational, reviewed by you and your
          provider, and isn&apos;t used to make significant decisions about you.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">6. How to make a request</h2>
      <p>
        Email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a> (or delete your
        account in the app: Profile → Delete account). We confirm within 10 business days and respond within 45 days
        (extendable by 45 more with notice). We verify you by matching the phone number or email on your account; more
        sensitive requests may need extra verification. An authorized agent can make a request with your signed
        permission, and we may ask you to confirm your identity directly. If we deny a request, we&apos;ll explain why and
        you can ask us to reconsider.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">7. Notice of financial incentive</h2>
      <p>
        Businesses on Atlas offer rewards programs: points for visits, purchases, reviews and referrals, member pricing,
        birthday rewards and gifts. Joining involves your identifiers, commercial information and program activity. The
        program&apos;s benefits and rules are shown in the app when you join. We believe the value of these benefits is
        reasonably related to the value of the information, based on the program&apos;s expected effect on how often
        members return and buy. Joining is optional, and you can leave at any time by deleting your account or asking the
        business, keeping anything already redeemed (unused points may expire under the program&apos;s rules).
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">8. Shine the Light</h2>
      <p>
        We don&apos;t disclose personal information to third parties for their own direct marketing. You can still ask by
        emailing <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a> with &quot;Shine
        the Light&quot; in the subject.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">9. Updates and contact</h2>
      <p>
        We update this notice at least every 12 months. If you have a disability and need it in another format, or have
        any question, email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a>.
      </p>
    </article>
  );
}
