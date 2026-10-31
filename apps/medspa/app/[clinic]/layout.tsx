import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getClinic } from "@/lib/clinic";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { clinic: string } }): Promise<Metadata> {
  const c = await getClinic(params.clinic).catch(() => null);
  if (!c) return { title: "Clinic not found" };
  const icon = c.appIconUrl ?? "/atlas-icon-512.png";
  return {
    title: c.name,
    manifest: `/${c.slug}/app-manifest`,
    appleWebApp: { capable: true, title: c.name, statusBarStyle: "default" },
    icons: { icon, apple: icon },
  };
}

/** Every clinic screen: sets the clinic's brand color for the whole subtree. Patient screens are phone-width (PatientFrame); the desk is full width. */
export default async function ClinicLayout({ children, params }: { children: React.ReactNode; params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic);
  if (!clinic) notFound();
  return (
    <div style={{ ["--p" as string]: clinic.primary, ["--p-rgb" as string]: clinic.primaryRgb }}>
      {children}
    </div>
  );
}
