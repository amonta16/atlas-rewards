"use client";
/**
 * The patient can land back from Stripe a moment before the webhook marks the
 * order paid and the points land. Re-check for about 20 seconds, then stop.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OrderWatcher() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (tries > 10) { clearInterval(t); return; }
      router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
