/**
 * fcm-server — CP-77
 *
 * Sends native pushes through Firebase Cloud Messaging (HTTP v1) with
 * ZERO new npm dependencies: the service-account JWT is signed with
 * Node's crypto and exchanged for an OAuth token (cached ~1h).
 *
 * ENV (Vercel): FIREBASE_SERVICE_ACCOUNT — the service-account JSON from
 * Firebase Console → Project settings → Service accounts → Generate new
 * private key. Paste raw JSON or base64 of it (base64 avoids newline
 * mangling in env UIs). Missing env = native sends quietly skipped, so
 * this deploys safely before Firebase exists.
 */
import crypto from "crypto";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let saCache: ServiceAccount | null | undefined;
let tokenCache: { token: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  if (saCache !== undefined) return saCache;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) {
    console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT missing — native push disabled.");
    saCache = null;
    return saCache;
  }
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const p = JSON.parse(json);
    if (!p.project_id || !p.client_email || !p.private_key) throw new Error("missing fields");
    saCache = {
      project_id: p.project_id,
      client_email: p.client_email,
      // env UIs sometimes store literal \n — normalize.
      private_key: String(p.private_key).replace(/\\n/g, "\n"),
    };
  } catch (e) {
    console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT unparsable:", (e as Error)?.message);
    saCache = null;
  }
  return saCache;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function accessToken(): Promise<string | null> {
  const acct = serviceAccount();
  if (!acct) return null;
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: acct.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(acct.private_key);
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    console.warn("[fcm] token exchange failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const j = await res.json();
  if (!j?.access_token) return null;
  tokenCache = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) };
  return tokenCache.token;
}

export type FcmResult = "sent" | "dead" | "failed" | "disabled";

/**
 * Send one notification to one FCM device token.
 * "dead" = token unregistered (uninstall) → caller deletes the row,
 * mirroring web-push 404/410 handling.
 */
export async function sendFcm(
  deviceToken: string,
  payload: { title: string; body?: string | null; link_path?: string | null; kind?: string | null },
): Promise<FcmResult> {
  const acct = serviceAccount();
  if (!acct) return "disabled";
  const bearer = await accessToken();
  if (!bearer) return "failed";

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: {
            title: payload.title,
            body: payload.body ?? "",
          },
          // data values MUST be strings; read on tap by onPushTap (lib/native.ts)
          data: {
            link_path: payload.link_path ?? "/",
            kind: payload.kind ?? "generic",
          },
          android: { priority: "HIGH" },
          apns: { payload: { aps: { sound: "default" } } }, // CP-79 (iOS) ready
        },
      }),
    },
  );

  if (res.ok) return "sent";
  const text = await res.text().catch(() => "");
  // UNREGISTERED / invalid-token → prune, same as web-push 404/410.
  if (res.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) {
    return "dead";
  }
  console.warn("[fcm] send failed:", res.status, text.slice(0, 300));
  return "failed";
}
