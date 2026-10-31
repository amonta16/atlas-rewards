import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { GateProvider } from "@/components/gate";
import { TabBar } from "@/components/chrome";

/** The four-tab app (Home · Shop · Rewards · Profile). Login lives outside it. */
export default async function TabsLayout({ children, params }: { children: React.ReactNode; params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const canRedeem = patient.signedIn && clinic.rewards.some((r) => r.point_cost <= patient.points);
  return (
    <div className="relative mx-auto min-h-[100dvh] max-w-md bg-page">
    <GateProvider slug={clinic.slug} signedIn={patient.signedIn}>
      <main style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>{children}</main>
      <TabBar slug={clinic.slug} dot={canRedeem ? "rewards" : null} />
    </GateProvider>
    </div>
  );
}
