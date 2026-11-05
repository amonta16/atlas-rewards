import type { Metadata } from "next";

/** The desk installs as its own app ("Front Desk"), separate from the patient app. */
export async function generateMetadata({ params }: { params: { clinic: string } }): Promise<Metadata> {
  return {
    manifest: `/${params.clinic}/desk-manifest`,
    appleWebApp: { capable: true, title: "Front Desk", statusBarStyle: "default" },
  };
}

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
