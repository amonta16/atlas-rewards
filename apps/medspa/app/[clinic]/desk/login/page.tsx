import { getClinic } from "@/lib/clinic";
import { StaffLogin } from "@/components/desk/staff-login";

export const metadata = { title: "Front desk · Sign in" };

export default async function DeskLogin({ params }: { params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  return <StaffLogin slug={clinic.slug} clinicName={clinic.name} logoUrl={clinic.logoUrl} />;
}
