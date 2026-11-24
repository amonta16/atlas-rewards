import { NextResponse } from "next/server";

/**
 * Android App Links verification for the Play app (native/medspa-shell,
 * com.atlasengine.medspa). With this file in place, tapping a
 * med.atlas-engine.app link or scanning a clinic QR opens the app directly
 * instead of the browser.
 *
 * Fingerprints: the upload key (sideloaded / locally built releases) plus
 * the Play App Signing key, which Google shows in Play Console → Test and
 * release → App integrity once the first bundle is uploaded. Add that one
 * to ANDROID_APP_SHA256 on Vercel (comma-separated), or to the list below.
 *
 * CP-274 (2026-11-24): the Play App Signing key (classical) is now in the list. It's what installs from
 * Google Play are signed with, so without it Play users' links opened in the browser. Public value, not a secret.
 */
const PACKAGE = "com.atlasengine.medspa";
const UPLOAD_KEY_SHA256 = "2F:03:FB:B9:5F:1E:51:53:0F:82:C9:8A:7F:9E:F3:71:25:00:1B:0F:66:E8:5D:DA:27:82:52:14:02:DA:4B:4A";
const PLAY_SIGNING_SHA256 = "36:04:B0:FC:11:85:3A:02:E1:D6:38:93:48:B1:C7:7A:B3:3C:7D:FA:DE:7D:53:22:93:0D:27:BC:F7:35:A2:FC";

export const dynamic = "force-dynamic";

export function GET() {
  const extra = (process.env.ANDROID_APP_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const fingerprints = Array.from(new Set([PLAY_SIGNING_SHA256, UPLOAD_KEY_SHA256, ...extra]));
  return NextResponse.json(
    [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: fingerprints } }],
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
