import type { Metadata } from "next";
import { siteFontClass } from "@/lib/landing/site-fonts";
import { SMS_CONSENT_TEXT, SMS_PRIVACY_URL, SMS_TERMS_URL } from "@/lib/preview/consent";
import "../../../site.css";

/**
 * /medspa/app/sms-consent — CP-236 · the SMS opt-in form, visible without clicking.
 *
 * The real form is step 2 of /medspa/app (after the owner picks their practice), so a
 * page scrape of /medspa/app only sees the search box. This page renders the same
 * contact form, server-side, with the same unchecked box and the same wording
 * (lib/preview/consent.ts), for carrier / Twilio A2P review. The fields here don't
 * submit; the button starts the real flow.
 */
export const metadata: Metadata = {
  title: { absolute: "Text message consent · Atlas Engine" },
  description: "How Atlas Engine collects consent to text med spa owners their app preview.",
  robots: { index: false, follow: true },
};

const field = "h-[52px] w-full rounded-2xl border border-[#0B1B2B]/12 bg-white px-4 text-[16px] text-[#0B1B2B] placeholder:text-[#8A97A8]";

export default function SmsConsentPage() {
  return (
    <div className={siteFontClass}>
      <div className="site min-h-[100dvh] bg-white">
        <div className="mx-auto w-full max-w-[560px] px-5 pb-16 pt-6">
          <header className="flex h-10 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-6 w-auto" />
          </header>

          <p className="mt-8 rounded-2xl bg-[#F1F6FD] p-4 text-[14.5px] leading-relaxed text-[#3A4A5C]">
            This is the contact form med spa owners and managers see at step 2 of our free app preview at{" "}
            <a href="/medspa/app" className="font-semibold text-[#0B5FD6] underline">atlas-engine.app/medspa/app</a>, right after they pick
            their practice. The SMS consent box is <b>unchecked by default</b> and is required only to receive texts.
          </p>

          <h1 className="mt-8 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-[#0B1B2B]">Where should we send your app?</h1>

          <form className="mt-6 space-y-4" action="/medspa/app" method="get">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[14px] font-medium text-[#3A4A5C]">First name<input className={`${field} mt-1.5`} name="first_name" autoComplete="off" readOnly /></label>
              <label className="block text-[14px] font-medium text-[#3A4A5C]">Last name<input className={`${field} mt-1.5`} name="last_name" autoComplete="off" readOnly /></label>
            </div>
            <label className="block text-[14px] font-medium text-[#3A4A5C]">Email<input className={`${field} mt-1.5`} type="email" name="email" placeholder="you@yourspa.com" autoComplete="off" readOnly /></label>
            <label className="block text-[14px] font-medium text-[#3A4A5C]">Mobile
              <div className="mt-1.5 flex gap-2">
                <span className="grid h-[52px] shrink-0 place-items-center rounded-2xl border border-[#0B1B2B]/12 bg-[#F6F9FD] px-4 text-[16px] text-[#0B1B2B]">US +1</span>
                <input className={field} type="tel" name="phone" placeholder="(555) 555-0123" autoComplete="off" readOnly />
              </div>
            </label>
            <label className="flex items-start gap-3 pt-1 text-[13px] leading-snug text-[#3A4A5C]">
              <input type="checkbox" name="sms_consent" className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B5FD6]" defaultChecked={false} />
              <span>
                {SMS_CONSENT_TEXT}{" "}
                <a href={SMS_TERMS_URL} className="underline">Terms</a> · <a href={SMS_PRIVACY_URL} className="underline">Privacy Policy</a>
              </span>
            </label>
            <button type="submit" className="s-btn s-btn-primary s-focus h-14 w-full text-[17px]">Start my free app preview</button>
          </form>

          <section className="mt-10 space-y-3 text-[14.5px] leading-relaxed text-[#3A4A5C]">
            <h2 className="text-[18px] font-bold text-[#0B1B2B]">About these text messages</h2>
            <p><b>Who gets them:</b> owners and managers of US med spas who request their app preview and tick the box above, or who text our number first from their preview page.</p>
            <p><b>What we send:</b> the link to their app preview, answers to their questions, reminders for walkthrough calls they booked, and occasional follow-ups and offers about Atlas Engine&apos;s patient app and membership service.</p>
            <p><b>How often:</b> message frequency varies, usually 2–6 messages a month. Message and data rates may apply.</p>
            <p><b>Opt out or get help:</b> reply STOP at any time to stop, or HELP for help. You can also email <a href="mailto:andrew@atlas-engine.app" className="underline">andrew@atlas-engine.app</a>.</p>
            <p><b>Your number:</b> no mobile information will be shared with third parties or affiliates for marketing or promotional purposes. See our <a href={SMS_PRIVACY_URL} className="underline">Privacy Policy</a> and <a href={SMS_TERMS_URL} className="underline">Terms</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
