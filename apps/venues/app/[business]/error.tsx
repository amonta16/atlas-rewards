"use client";
// CP-218: business pages (landing, signup, login, the app layout itself).
import { RouteError } from "@/components/ui/route-error";
export default function BusinessError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} />;
}
