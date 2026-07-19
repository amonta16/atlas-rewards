# CP-76 — Capacitor Shell (the actual Android app)

The Atlas Rewards mobile app: a Capacitor shell in `mobile-shell/` whose webview loads the live deployment, with real native layers bridged in. Web-layer ships keep reaching the app instantly; only shell changes need a store release.

## What shipped (code — already done)

**Web app (deploys like any checkpoint, safe for web/PWA users — everything no-ops outside the shell):**
- `lib/native.ts` — duck-typed bridge to the injected Capacitor runtime (no npm deps in the web bundle): `isNative`, native QR scan, Preferences (native storage shared across ALL subdomains — this is how the app remembers your business even though each business is a different web origin), app build number, install referrer, deep-link listener.
- `components/native/native-shell.tsx` (mounted in root layout) — remembers the current business subdomain in native Preferences; reads `app_config` (CP-75) and shows the **Update required** wall (build < `min_supported_build`) or **kill-switch** wall; routes App Links into the webview.
- `/join` upgraded — inside the app it: cold-boots straight into your last business; auto-fills from the Play **Install Referrer** (the `?referrer=<code>` from `/j/<code>`) showing the branded confirm card; has a native **Scan their QR code** camera button (accepts `/j/<code>`, `/qr/<slug>`, or a bare code). `?stay=1` skips auto-boot (future "switch business" path).

**Shell project (`mobile-shell/`):** `capacitor.config.ts` (appId `com.atlasengine.rewards`, boots `https://atlas-engine.app/join`, subdomains stay in-webview, offline `error.html`), `package.json` (Capacitor 7 + App/Preferences/Barcode-Scanner plugins), offline fallback pages, icon/splash instructions in `resources/`.

## Runbook — do this on YOUR machine (~1–2 hours first time)

> ⚠ **OneDrive warning:** Gradle + OneDrive sync fight each other. Before building, either pause OneDrive syncing, or copy `mobile-shell/` to e.g. `C:\dev\mobile-shell` and build there (copy `android/` back when done, or keep the shell living outside OneDrive permanently — it only changes rarely).

**1. Install prerequisites (once):**
- [Android Studio](https://developer.android.com/studio) (includes SDK + emulator; accept all defaults). JDK comes bundled.
- Node you already have.

**2. Generate the native Android project (once):**
```bash
cd mobile-shell
npm install
npx cap add android
npx cap sync
```
This creates `mobile-shell/android/` — a real Android Studio project. Commit it.

**3. First run on a real phone:**
- Enable Developer Options + USB debugging on your Android phone (Settings → About → tap Build number 7×).
- Plug in, then: `npx cap open android` → wait for Gradle sync → press ▶ with your phone selected.
- Expected: app opens → `/join` screen → enter a business code → full branded experience. Test the **Scan their QR code** button against a printed `/j/<CODE>` QR.

**4. Icon + splash:** drop `icon.png` + `splash.png` into `mobile-shell/resources/` (specs in the README there), then:
```bash
npx @capacitor/assets generate --android && npx cap sync
```

**5. Every future shell release:** bump `versionCode` (+1 every upload) and `versionName` in `android/app/build.gradle`. `versionCode` is the build number the CP-75 `app_config.min_supported_build` gate compares against.

**6. Release build (CP-78, when Play Console is ready):**
- Android Studio → Build → Generate Signed App Bundle → create an **upload keystore** (SAVE the .jks + passwords in a password manager — losing it is painful even with Play App Signing).
- Output `.aab` is what you upload to Play Console (Play App Signing stays ON, default).

## Verify before calling CP-76 done
- [ ] Cold start → boots into last-joined business (join once, kill app, reopen)
- [ ] "Not your business? Try another code" → forgets the saved business
- [ ] Native QR scan joins a business (camera permission prompt appears once, with the system dialog)
- [ ] Airplane mode → `error.html` "You're offline" + Try again works
- [ ] `app_config`: set `min_supported_build = 999` in Supabase → update wall appears; set back to 0 → gone
- [ ] Kill switch: `kill_switch = true` → maintenance wall; revert
- [ ] Regular web/PWA in a desktop browser: zero behavior change

## Known limitations (by design, for later checkpoints)
- Push notifications: CP-77 (FCM).
- App Links (QR opens the installed app directly): needs `assetlinks.json` with the Play App Signing SHA-256 — only exists after first Play upload → CP-78.
- Install-referrer auto-join: wired defensively in the web app; the shell-side referrer plugin gets picked + added in CP-77 alongside FCM (both touch the native project).
- iOS: same shell, `npx cap add ios`, but needs a Mac/CI — CP-79.
