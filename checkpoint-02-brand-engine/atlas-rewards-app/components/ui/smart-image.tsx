"use client";
/**
 * SmartImage — CP-115
 *
 * Drop-in replacement for <img> on reward/offer photos. Instead of a blank
 * WHITE box while a remote Supabase image loads, it shows a brand-tinted
 * shimmer (animate-pulse over the brand color at ~8% alpha) until the image
 * decodes, then clears it. Also sets decoding="async" + a loading hint so
 * above-the-fold images (eager) start fetching immediately.
 *
 * Keeps the exact same className the old <img> had, so layouts/sizing are
 * unchanged — it's a true drop-in.
 */
import { useState, type CSSProperties } from "react";

export function SmartImage({
  src,
  alt = "",
  className = "",
  tint,
  eager = false,
  style,
}: {
  src: string;
  alt?: string;
  className?: string;
  /** Brand color (hex) used for the loading shimmer. */
  tint?: string | null;
  /** Above-the-fold? Fetch eagerly + high priority. */
  eager?: boolean;
  style?: CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const shimmer = tint ? `${tint}14` : "#eef1f4"; // ~8% brand tint, else soft grey

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      className={`${className} ${loaded ? "" : "animate-pulse"}`}
      style={{ backgroundColor: loaded ? undefined : shimmer, ...style }}
      {...({ fetchpriority: eager ? "high" : "auto" } as Record<string, string>)}
    />
  );
}
