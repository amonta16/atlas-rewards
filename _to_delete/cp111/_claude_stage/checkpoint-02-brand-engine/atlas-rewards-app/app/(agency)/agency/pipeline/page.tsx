import { redirect } from "next/navigation";

/**
 * /agency/pipeline — retired in CP-111.
 *
 * The CP-50 prospect board that lived here was replaced by the pipeline
 * opportunity manager on Revenue Analytics (/agency/analytics), which
 * shows the same records (the agency_pipeline table — nothing was
 * deleted; legacy stages were remapped with the originals preserved in
 * legacy_stage) plus win probability, follow-ups, sources, and the
 * weighted-MRR math.
 *
 * This route stays as a permanent redirect because the old URL may be
 * bookmarked or sitting in someone's open tab. There is no role check
 * here on purpose: the destination page enforces agency-admin access on
 * the server, so bouncing through this redirect grants nothing.
 */
export const dynamic = "force-dynamic";

export default function AgencyPipelinePage() {
  redirect("/agency/analytics");
}
