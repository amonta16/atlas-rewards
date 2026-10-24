"use client";
/**
 * AutomationsHome — CP-217 · picks the view for /agency/automations.
 * Med spas: the Atlas suite by default, custom canvas behind the switch.
 * Everyone else: the custom builder, with a note that their suite is next.
 */
import type { BusinessOption } from "@/lib/automations/types";
import { SuiteView } from "./suite-view";
import { WorkflowBuilder } from "./workflow-builder";
import { ViewSwitch } from "./hub-header";

export function AutomationsHome({ businesses, business, view }: { businesses: BusinessOption[]; business: BusinessOption; view: "suite" | "custom" }) {
  const isMedspa = business.layout_preset === "medspa";
  if (isMedspa && view === "suite") return <SuiteView businesses={businesses} business={business} />;
  return (
    <WorkflowBuilder
      businesses={businesses} business={business}
      switcher={isMedspa ? <ViewSwitch business={business} view="custom" /> : undefined}
      note={!isMedspa ? (
        <div className="mt-3 rounded-xl border border-[#d6e4fa] bg-[#f5f9ff] px-4 py-2.5 text-[12.5px] text-[#2a3a5c]">
          <b className="font-semibold text-[#06318F]">The classic suite is coming next.</b> Med spas already get a ready-made set of journeys. For {business.name}, build custom workflows here in the meantime.
        </div>
      ) : undefined}
    />
  );
}
