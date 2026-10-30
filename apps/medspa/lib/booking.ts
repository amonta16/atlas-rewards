/**
 * Booking, the Dermis way: Atlas doesn't run a calendar. After a purchase
 * (or from any "Book" button) the patient goes to the clinic's own
 * scheduling page (the treatment's own link first, then the clinic-wide
 * one) or texts / WhatsApps / calls with a pre-filled message. Clinics set
 * these in the builder (Booking + each treatment's booking link).
 */
import { bookingOptions, type BookingOptions } from "./medspa";
import { treatmentById, type Clinic } from "./clinic";

export function bookFor(clinic: Clinic, treatmentId: string | null, message: string): BookingOptions {
  const t = treatmentId ? treatmentById(clinic, treatmentId) : null;
  return bookingOptions({ ...clinic.cfg.booking, message }, clinic.name, clinic.phone, t ?? null);
}

/** The first included treatment of a plan, so "book your first visit" can deep-link to it. */
export function planFirstTreatment(clinic: Clinic, planName: string | null): string | null {
  const plan = clinic.plans.find((p) => p.name === planName) ?? null;
  return plan?.included.find((i) => i.treatment_id)?.treatment_id ?? null;
}
