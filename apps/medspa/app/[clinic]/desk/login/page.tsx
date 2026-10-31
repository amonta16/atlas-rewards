import { getClinic } from "@/lib/clinic";
import { StaffLogin } from "@/components/desk/staff-login";

export const metadata = { title: "Front desk · Sign in" };

export default async function DeskLogin({ params, searchParams }: { params: { clinic: string }; searchParams: { view?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  return <StaffLogin slug={clinic.slug} clinicName={clinic.name} logoUrl={clinic.logoUrl} view={/^[a-z]+$/.test(searchParams.view ?? "") ? searchParams.view : undefined} />;
}
