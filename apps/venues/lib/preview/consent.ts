/**
 * lib/preview/consent.ts — CP-236 · the SMS consent wording, in ONE place.
 *
 * Two separate, optional, unchecked boxes (carriers reject one box that bundles
 * informational and marketing texts):
 *   · SMS_INFO_CONSENT_TEXT      → the preview link, answers, walkthrough reminders
 *   · SMS_MARKETING_CONSENT_TEXT → offers and promotions
 * Neither is needed to get the preview (it is emailed too).
 *
 * Used by the contact step of /medspa/app and by the public copy of that form at
 * /medspa/app/sms-consent (the page Twilio's A2P review reads). Change it here and
 * both stay identical, which is what carriers check.
 */
export const SMS_INFO_CONSENT_TEXT =
  "Text me my app preview link, answers to my questions and reminders for calls I book from Atlas Engine at the mobile number above. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help.";

export const SMS_MARKETING_CONSENT_TEXT =
  "Also text me occasional offers and promotions from Atlas Engine at the mobile number above. Msg & data rates may apply. Up to 4 msgs/month. Reply STOP to opt out. Consent isn't a condition of purchase.";

export const SMS_TERMS_URL = "/legal/terms#sms";
export const SMS_PRIVACY_URL = "/legal/privacy#sms";
export const SMS_CONSENT_PAGE = "/medspa/app/sms-consent";
