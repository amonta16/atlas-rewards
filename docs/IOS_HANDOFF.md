# MedSpa App for iPhone: brief for Claude on the Mac

You are starting fresh. The Android work was done on Andrew's Windows PC and you cannot see that chat. This file is the context.
This repo is PUBLIC: never commit keys, passwords, .p8 files, service accounts or personal data.

## What it is
One patient app for every med spa Atlas works with. It loads the live site https://med.atlas-engine.app in a Capacitor 8 webview and reopens to the patient's clinic. Android (Google Play) is built from `native/medspa-shell` and was in Play review on 2026-11-24.

Andrew's decisions, keep them:
- Name **MedSpa App**. Bundle id `com.atlasengine.medspa`.
- Gold sparkle on champagne (`native/medspa-shell/assets`). Brand blue and the Atlas mark belong to AE Rewards: do not use them here.
- Fully separate from AE Rewards (`native/venues-shell`): different icon, splash and Firebase project. Use that folder as a pattern only. Never copy its GoogleService-Info.plist, icons or bundle id.
- The inside of the app stays as it is. Ask before any visible change, any store name or text choice, and before pushing to `main` (main deploys both live sites).
- He likes short steps and wants to be asked before things that are hard to undo.

## Check with Andrew first
1. Is the Apple Developer account approved as an **organization**? He submitted the change around 2026-11-20. Submit the app after it is approved, so the LLC shows as seller.
2. The Mac's macOS and Xcode versions. App Store Connect needs Xcode 26+ with the iOS 26 SDK (since 2026-04-28). Capacitor 8 needs Xcode 26+ and Node 22+.
3. It is a friend's Mac. Use a separate macOS user account, and at the end remove the Apple ID from Xcode, the signing certificate, the .p8 file and the GitHub login.

## Build
1. Clone `https://github.com/amonta16/atlas-rewards.git`, branch `medspa-ios`, in a folder outside iCloud Drive.
2. In `native/medspa-shell`: `npm ci`, install `@capacitor/ios` at the same version as `@capacitor/android`, then `npx cap add ios`. Check whether that made a Swift Package Manager or a CocoaPods project and follow that one.
3. `www/error.html` is the offline page. iOS reports cancelled navigations as errors, so confirm it does not flash on launch.
4. Icons and splash from `assets/` (`npx capacitor-assets generate --ios`). No alpha in the 1024 icon.
5. Portrait only, iPhone only (`TARGETED_DEVICE_FAMILY = 1`) unless Andrew wants iPad.
6. Info.plist: `NSCameraUsageDescription` naming both uses (scan a clinic QR code; take a selfie for the optional skin scan), and `ITSAppUsesNonExemptEncryption` = false.
7. Signing: Andrew signs in to Xcode himself. Automatic signing, the LLC team.

## Push
- Firebase project `medspa-app-1249d` (not the AE Rewards one). Andrew adds an iOS app with the bundle id and downloads GoogleService-Info.plist into the App target.
- Andrew creates an APNs key (.p8) on the Apple developer site and uploads it in Firebase > Project settings > Cloud Messaging. It never goes in the repo.
- The server sends through FCM, which rejects raw APNs tokens. Swap the APNs token for an FCM token: see `native/venues-shell/ios/App/App/AppDelegate.swift` (Firebase configure and `didRegisterForRemoteNotifications`). Add FirebaseMessaging, the Push capability, and Background Modes > Remote notifications.
- The web side exists: `apps/medspa/lib/native.ts`, `lib/push-client.ts`, `/api/notifications/subscribe` (saves `fcm-medspa:<token>`, platform `ios`) and `/api/push/deliver`. It was tested on Android only. Nothing has been tested on iOS.

## Links
Universal Links need `/.well-known/apple-app-site-association` on med.atlas-engine.app (Team ID + bundle id). Model: `apps/medspa/app/.well-known/assetlinks.json/route.ts`. Add Associated Domains `applinks:med.atlas-engine.app`. This is a web change: ask before main.

## Test on a real iPhone
- Find a clinic, pick Glow Aesthetics, kill the app and reopen: it should go back to it.
- QR camera, skin-scan selfie, push arrives and its tap opens the right screen.
- Stripe, Klarna, Maps and review links leave the app, and the patient can get back.
- Notch and home-bar spacing, keyboard, airplane mode.
- The remembered clinic and sign-in survive more than 7 days. WebKit can cap cookies written by JavaScript at 7 days; not verified for this app.

## App Review risks, look at these before submitting
- **4.2 repackaged website**: lead the review notes with push, camera QR and the selfie scan.
- **5.1.1(v) account deletion inside the app**: Profile > Delete account is a `target=_blank` link to www.atlas-engine.app/account/delete, shown only when signed in. Prove it works from inside the app with a real account.
- **5.1.2(i) and face data**: the skin scan sends a selfie to Perfect Corp. Consent is asked in `apps/medspa/components/skin-scan/flow.tsx`; confirm it names the third party and comes before the upload. Expect Apple to ask what face data is collected, why, where it goes and how long it is kept (see `apps/venues/app/legal/ai-skin-scan`).
- **1.4.1 / 5.1.3 health**: no diagnosis or accuracy claims. The example clinic shows BOTOX, JUVEDERM and Restylane, "FDA-approved" wording and before/after photos.
- **3.1.3(e)**: treatments and memberships used at the spa are paid outside in-app purchase. Spa gift cards: confirm they only buy in-person services (3.1.1).
- **Privacy label** must match the real data: name, email, phone, purchases, photos, skin-scan scores, user id, push token, app interactions. No tracking.
- **Reviewer access**: Glow Aesthetics (search "Glow") needs no account. Its sign-in is simulated in code (any number, any code), read from the code and not tried in the app. Try it before writing it in the notes. The example clinic has no real account to delete, so Apple may want a real test login.

## Store text and images
`native/medspa-shell/resources/store/store-listing.md`. Do not reuse the Android screenshots. Take iPhone ones on the simulator: no Android frames, no brand names (HydraFacial included), no before/after.

## Finish
TestFlight first. Andrew handles the agreements, and presses Submit himself.
