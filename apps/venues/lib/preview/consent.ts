/**
 * lib/preview/consent.ts — CP-236 · the SMS consent wording, in ONE place.
 *
 * Used by the contact step of /medspa/app and by the public copy of that form at
 * /medspa/app/sms-consent (the page Twilio's A2P review reads). Change it here and
 * both stay identical, which is what carriers check.
 */
export const SMS_CONSENT_TEXT =
  "Text me my app and follow-ups from Atlas Engine at this number. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help. Consent isn't a condition of purchase.";

export const SMS_TERMS_URL = "/legal/terms#sms";
export const SMS_PRIVACY_URL = "/legal/privacy#sms";
export const SMS_CONSENT_PAGE = "/medspa/app/sms-consent";
