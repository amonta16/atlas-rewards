/** The clinic a patient picked, so reopening the app goes straight back to it. */
export const CLINIC_COOKIE = "ms_clinic";

export function rememberClinic(slug: string) {
  document.cookie = `${CLINIC_COOKIE}=${encodeURIComponent(slug)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function forgetClinic() {
  document.cookie = `${CLINIC_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
