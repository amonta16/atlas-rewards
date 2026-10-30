#!/usr/bin/env node
/**
 * generate-vapid.mjs — CP-32
 *
 * Prints a fresh VAPID keypair in the exact env-var format you need
 * to paste into Vercel (and into .env.local for dev). Run with:
 *
 *   npm run vapid
 *
 * Requires that `web-push` is installed (it's a dep of the app — so
 * `npm install` once and this works).
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("");
console.log("✨ Atlas VAPID keys generated. Paste these into Vercel → Project → Settings → Environment Variables.");
console.log("   Also copy into .env.local if you want push working in `npm run dev`.");
console.log("");
console.log("──────────────────────────────────────────────────────────────");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_SUBJECT=mailto:hello@atlas-engine.org`);
console.log("──────────────────────────────────────────────────────────────");
console.log("");
console.log("⚠️  Save these somewhere safe. If you lose VAPID_PRIVATE_KEY,");
console.log("    every subscribed device will need to re-subscribe.");
console.log("");
