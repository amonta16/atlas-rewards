import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getClinic } from "@/lib/clinic";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { clinic: string } }): Promise<Metadata> {
  const c = await getClinic(params.clinic);
  return { title: c ? c.name : "Clinic not found" };
}

/** Every clinic screen: sets the clinic's brand color for the whole subtree. */
export default async function ClinicLayout({ children, params }: { children: React.ReactNode; params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic);
  if (!clinic) notFound();
  return (
    <div className="relative mx-auto min-h-[100dvh] max-w-md bg-page" style={{ ["--p" as string]: clinic.primary, ["--p-rgb" as string]: clinic.primaryRgb }}>
      {children}
    </div>
  );
}
