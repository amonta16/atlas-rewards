"use client";
// CP-218: customer app tabs — failed loads show a retry, not a dead screen.
import { RouteError } from "@/components/ui/route-error";
export default function CustomerAppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} />;
}
