/**
 * lib/sms-consent.ts — CP-246 · the SMS consent wording for the unlock sheet on /p/<slug>.
 * MUST MATCH apps/venues/lib/preview/consent.ts word for word (that's the wording the A2P
 * registration and /medspa/app/sms-consent show). tests/sms-consent-sync.test.ts in venues checks it.
 */
export const SMS_INFO_CONSENT_TEXT =
  "Text me my app preview link, answers to my questions and reminders for calls I book from Atlas Engine at the mobile number above. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help.";

export const SMS_MARKETING_CONSENT_TEXT =
  "Also text me occasional offers and promotions from Atlas Engine at the mobile number above. Msg & data rates may apply. Up to 4 msgs/month. Reply STOP to opt out. Consent isn't a condition of purchase.";
