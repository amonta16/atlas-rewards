import { notFound } from "next/navigation";
import { activeTreatments, getClinic, skinScanOn } from "@/lib/clinic";
import { bookingOptions } from "@/lib/medspa";
import { EXAMPLE_IMG } from "@/lib/example";
import { SkinScanFlow } from "@/components/skin-scan/flow";

export const metadata = { title: "AI skin scan" };

/** Free AI skin scan: selfie → skin score, face map, AI "after" preview, and this clinic's treatments matched to it. */
export default async function SkinScan({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  if (!skinScanOn(clinic)) notFound();
  return (
    <SkinScanFlow
      slug={clinic.slug}
      clinicName={clinic.name}
      hero={EXAMPLE_IMG.hero}
      treatments={activeTreatments(clinic)}
      booking={bookingOptions(clinic.cfg.booking, clinic.name, clinic.phone, { name: "a skin consultation", booking_url: null })}
    />
  );
}
