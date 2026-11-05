import { getClinic } from "@/lib/clinic";
import { PhoneLogin } from "@/components/phone-login";

export const metadata = { title: "Sign in" };

/** Text sign-in is a Supabase project setting (Twilio). Ask it, so the screen switches by itself once it's on. */
async function textSignInOn(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 60 } });
    return !!((await res.json()) as { external?: { phone?: boolean } }).external?.phone;
  } catch { return true; }
}

export default async function Login({ params, searchParams }: { params: { clinic: string }; searchParams: { next?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const home = `/${clinic.slug}`;
  // Only same-clinic paths: never bounce to another site after sign-in.
  const next = searchParams.next && searchParams.next.startsWith(`${home}`) && !searchParams.next.startsWith("//") ? searchParams.next : home;
  const demo = clinic.isExample && clinic.id === "example";
  const textOn = demo || (await textSignInOn());
  return <div className="relative mx-auto min-h-[100dvh] max-w-md bg-page"><PhoneLogin slug={clinic.slug} clinicName={clinic.name} logoUrl={clinic.logoUrl} next={next} demo={demo} textOn={textOn} /></div>;
}
