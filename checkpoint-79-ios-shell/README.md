# CP-79 — iOS Shell (run this on the Mac)

Same Capacitor shell as Android (`mobile-shell/`), new build target. The web app is already platform-neutral (lib/native.ts detects iOS via the WKWebView bridge), so this is configuration, not new code.

## Phase 1 — app running in the iOS Simulator (today, free, no Apple account needed)

**1. Install (once, start the big download first):**
- **Xcode** from the Mac App Store (~10+ GB — kick it off, then do the rest while it downloads). Open it once after install → accept license → let it install components.
- **Node LTS** from [nodejs.org](https://nodejs.org) (or `brew install node` if Homebrew exists).
- **CocoaPods** (Capacitor's iOS dependency manager): in Terminal → `sudo gem install cocoapods` (if this fights you on a new Mac: `brew install cocoapods`).

**2. Get the repo onto the Mac:**
```bash
git clone <YOUR-REPO-URL> atlas
cd atlas/mobile-shell
```

**3. Generate + open the iOS project:**
```bash
npm install
npx cap add ios
npx cap sync
```

**4. Camera permission (required before the QR scanner can ever run — App Store rejects builds without it):**
Open `ios/App/App/Info.plist` and inside the top-level `<dict>` add:
```xml
<key>NSCameraUsageDescription</key>
<string>Scan your business's QR code to join and check in.</string>
```

**5. Run it:**
```bash
npx cap open ios
```
In Xcode: device dropdown (top center) → pick an iPhone simulator (e.g. iPhone 16) → press ▶. First build is slow. Expected: Atlas Rewards boots to /join, and the whole Android verify checklist applies (join by code → branded app → close/reopen boots into business, logged in).

**6. Real iPhone (optional now, needed for TestFlight later):**
- Xcode → Settings → Accounts → + → sign in with the Apple ID (free works for device testing; the $99 Developer account is required for TestFlight/App Store).
- Plug in the iPhone → trust the computer → select it as the run target.
- Project navigator → App → Signing & Capabilities → check "Automatically manage signing" → Team = your account.

## Phase 2 — store-readiness (needs the paid Apple Developer account)
- **Push:** Xcode → Signing & Capabilities → + Capability → Push Notifications AND Background Modes → Remote notifications. Then Firebase Console → project settings → add iOS app (`com.atlasengine.rewards`) → download `GoogleService-Info.plist` into `ios/App/App/`, and upload an **APNs Auth Key** (developer.apple.com → Keys → create APNs key) to Firebase → Cloud Messaging settings. Server code (CP-77) is already iOS-ready.
- **Universal Links:** Associated Domains capability → `applinks:atlas-engine.app` + host an `apple-app-site-association` file (build alongside Android's `assetlinks.json` in CP-78).
- **iOS cookie note:** WKWebView can be lazier than Android about persisting cookies. Test the close/reopen-still-logged-in flow explicitly on iOS; if sessions drop, the fix is a small AppDelegate addition (`WKWebsiteDataStore` flush) — flag it and it'll be patched.
- TestFlight: Product → Archive → Distribute → App Store Connect, then invite testers in the TestFlight tab.

## Gotchas
- `xcodebuild requires Xcode` error in Terminal → run: `sudo xcode-select -s /Applications/Xcode.app`
- Pod install failures → `cd ios/App && pod install --repo-update`
- The shell boots `https://www.atlas-engine.app/join` (capacitor.config.ts) — production web must be deployed for the app to show current code.
