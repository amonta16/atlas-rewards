"use client";
/**
 * SwitchBusinessLink — CP-98.
 *
 * Escape hatch from a business's landing / signup / login screens back to
 * the neutral Atlas business finder (/join — scan a QR or type a code).
 * Before this, a customer who scanned the wrong business's QR (or tapped
 * through from the wrong link) was trapped: the join screen had no way
 * out except creating an account.
 *
 * Routing care, in order:
 *   - Business SUBDOMAIN (web/PWA): middleware rewrites every relative
 *     path to /<slug>/<path>, so a plain "/join" would 404. We hop to the
 *     apex origin explicitly (businessUrl handles local dev ports too).
 *   - Native app / www path routing / apex: same-origin "/join" works.
 *   - ?stay=1 suppresses the native cold-start auto-forward (CP-76), so
 *     the finder actually shows instead of bouncing right back to the
 *     business the customer is trying to leave.
 */

import { Store } from "lucide-react";
import { businessUrl } from "@/lib/utils";

export function SwitchBusinessLink({
  className,
  label = "Looking for a different business?",
}: {
  className?: string;
  label?: string;
}) {
  function go() {
    if (typeof window === "undefined") return;
    const path = "/join?stay=1";
    const host = window.location.hostname.toLowerCase();
    const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
    const onBusinessSubdomain =
      !!root && host !== root && host !== `www.${root}` && host.endsWith(`.${root}`);
    window.location.href = onBusinessSubdomain
      ? businessUrl(root, { path })
      : path;
  }

  return (
    <button
      type="button"
      onClick={go}
      className={
        className ??
        "inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
      }
    >
      <Store className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
