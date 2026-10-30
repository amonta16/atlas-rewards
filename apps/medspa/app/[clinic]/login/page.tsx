import { getClinic } from "@/lib/clinic";
import { PhoneLogin } from "@/components/phone-login";

export const metadata = { title: "Sign in" };

export default async function Login({ params, searchParams }: { params: { clinic: string }; searchParams: { next?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const home = `/${clinic.slug}`;
  // Only same-clinic paths: never bounce to another site after sign-in.
  const next = searchParams.next && searchParams.next.startsWith(`${home}`) && !searchParams.next.startsWith("//") ? searchParams.next : home;
  return <PhoneLogin slug={clinic.slug} clinicName={clinic.name} logoUrl={clinic.logoUrl} next={next} demo={clinic.isExample && clinic.id === "example"} />;
}
