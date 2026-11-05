"use client";
/**
 * Refer a friend: a shared link is `/<clinic>?ref=CODE`. Remember the code on
 * this device, then credit it once the friend is signed in (the same
 * process_referral function the venue app's signup uses).
 */
import { useEffect } from "react";
import { createClient } from "@atlas/core/supabase/client";

export function ReferralCapture({ slug, clinicId, signedIn, demo }: { slug: string; clinicId: string; signedIn: boolean; demo: boolean }) {
  useEffect(() => {
    if (demo) return;
    const key = `ms_ref_${slug}`;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      if (fromUrl && /^[A-Za-z0-9-]{3,24}$/.test(fromUrl)) localStorage.setItem(key, fromUrl);
      const code = localStorage.getItem(key);
      if (!code || !signedIn) return;
      createClient().rpc("process_referral", { p_referrer_code: code, p_business_id: clinicId }).then(({ error }) => {
        if (!error) { try { localStorage.removeItem(key); } catch { /* fine */ } }
      });
    } catch { /* storage blocked: no referral, nothing breaks */ }
  }, [slug, clinicId, signedIn, demo]);
  return null;
}
