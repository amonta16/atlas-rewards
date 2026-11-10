export const metadata = {
  title: "AI Skin Scan & Biometric Notice — Atlas Engine",
  description: "How the AI skin scan in med spa apps powered by Atlas Engine uses your photo, and how long anything is kept.",
};

/**
 * CP-242: notice + consent terms for the AI skin scan (med spa patient apps,
 * /[clinic]/skin-scan). Written to cover the face-data laws that ask for a
 * written notice, a stated purpose, a retention schedule and consent before
 * collection (Illinois BIPA, Texas CUBI, Washington RCW 19.375, and
 * CCPA/CPRA "sensitive personal information"). Have counsel review.
 */
export default function SkinScanNoticePage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-3xl font-extrabold tracking-tight">AI Skin Scan &amp; Biometric Notice</h1>
      <p className="text-sm text-zinc-500">Last updated: November 10, 2026</p>

      <p className="mt-4 leading-relaxed">
        Some med spa apps powered by Atlas Engine (&quot;Atlas,&quot; &quot;we,&quot; &quot;us&quot;) offer a free AI skin
        scan. You take or upload a selfie and get a skin score, a map of skin concerns, an AI-generated preview of
        possible results, and treatments from that clinic&apos;s menu. This notice explains exactly what happens to your
        photo. You must read it and agree before you scan. It adds to our{" "}
        <a href="/legal/privacy" className="underline">Privacy Policy</a> and{" "}
        <a href="/legal/terms" className="underline">Terms of Service</a>.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">1. What the scan uses</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Your photo.</strong> One selfie you take in the app or upload.</li>
        <li>
          <strong>Face position on your device.</strong> While the camera is open, the app finds your face (Google&apos;s
          MediaPipe, running entirely in your browser) to guide distance, angle and light, and to crop the photo. Those
          face points never leave your device and are not stored.
        </li>
        <li>
          <strong>Face and skin analysis.</strong> The cropped photo is sent to our processor, Perfect Corp. (YouCam API),
          which analyzes the skin (for example lines, pores, texture, spots, redness, under-eye areas) and creates the
          &quot;after&quot; preview. Analyzing a face this way may count as collecting &quot;biometric information&quot; or
          &quot;biometric identifiers&quot; under some state laws, so we treat it that way.
        </li>
        <li><strong>Your answers.</strong> The goals you pick (for example &quot;tired eyes&quot;).</li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">2. Why: the only purposes</h2>
      <p>
        To create your skin score, skin map and AI preview, and to match you with treatments on the clinic&apos;s menu.
        We do <strong>not</strong> use your photo or face data to identify you, to verify who you are, to train AI models,
        or for advertising. We never sell, lease, trade or otherwise profit from your face data, and we don&apos;t share
        it with anyone except the processor named here, to run your scan.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">3. What is kept, and for how long</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          <strong>Your photo and face data: Atlas does not store them.</strong> The photo goes from your device to Perfect
          Corp to be analyzed. Perfect Corp keeps processed files and results for up to 30 days under its API terms and
          then deletes them; result links expire after about 2 hours. Your browser keeps the last scan in this tab only
          (it clears when you close the tab or tap Scan again).
        </li>
        <li>
          <strong>Your scores, if you choose to save them.</strong> If you&apos;re signed in, your scores (numbers such as
          &quot;Texture 76&quot;), your goals and the matched treatments are saved to your profile so the clinic can plan
          your visit. These are not photos or face geometry. They stay until you delete them or your account, or until the
          clinic stops using Atlas.
        </li>
        <li>
          <strong>Destruction schedule.</strong> Any biometric information from a scan is permanently destroyed when the
          purpose of the scan has been met, and in every case within 30 days of the scan, and never later than allowed by
          applicable law (for Illinois residents, within 3 years of your last interaction with the clinic&apos;s app).
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">4. Your consent</h2>
      <p>
        By ticking the consent box before you scan, you confirm you are <strong>18 or older</strong>, that the photo is of
        you, and that you give your informed written consent for the photo to be analyzed by Perfect Corp as described
        here. Consent is optional: the rest of the app works the same if you never scan. You can withdraw consent at any
        time by not scanning again and asking us to delete saved scores (section 7).
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">5. Not medical advice</h2>
      <p>
        The skin scan and AI preview are cosmetic, informational tools. They are <strong>not</strong> a medical exam,
        diagnosis, or treatment recommendation, and they are not a promise of results. The &quot;after&quot; image is an
        AI simulation; real results vary by person, treatment and provider. Talk to a licensed provider before any
        treatment, and see a doctor for any skin condition that worries you.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">6. Who&apos;s responsible</h2>
      <p>
        The med spa whose app you use decides to offer the scan and receives your saved scores. Atlas runs the app and the
        scan for the clinic, as its service provider. Perfect Corp. is our processor for the analysis and preview and may
        not use your data for its own purposes.
      </p>

      <h2 className="text-xl font-bold mt-10 mb-2">7. Delete or ask about your data</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Delete your account (and every saved scan) in the app: Profile → Delete account.</li>
        <li>
          Or email <a href="mailto:hello@atlas-engine.app" className="underline">hello@atlas-engine.app</a> to delete saved
          scans, ask what we hold, or ask any question. We respond within 30 days.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-10 mb-2">8. Changes</h2>
      <p>
        If we change how the scan uses your data, we&apos;ll update this page and ask for your consent again before your
        next scan.
      </p>
    </article>
  );
}
