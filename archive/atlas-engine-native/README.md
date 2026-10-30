# Atlas Engine — Native shell (Expo + React Native)

The iOS + Android container app. Customer downloads it once, scans business QR codes (or browses Discover), and each saved business loads inside the app as a full-screen branded rewards experience via WebView. Like Stocard / Fivestars / Wallet, but for your agency's clients.

## Architecture

```
Atlas Engine (this folder, native shell)
├── (tabs)/
│   ├── index.tsx         Library — saved businesses (local AsyncStorage)
│   ├── scan.tsx          Camera-based QR scanner + manual entry
│   ├── discover.tsx      Browse all businesses, search by name
│   └── profile.tsx       Library count, version, links
└── business/[slug].tsx   Full-screen WebView pointed at the business's PWA

Each business in the library opens the existing Next.js PWA at
  https://<slug>.atlasrewards.app/app
inside a WebView. Auth is handled by each PWA separately — no shared
Atlas-Engine-level account in v1.
```

## How to run on your phone (no app store needed)

You can test the full Atlas Engine app on your phone in ~15 minutes via Expo Go.

### 1. Install Node + Expo CLI

```bash
npm install -g expo
```

### 2. Install Expo Go on your phone

- iPhone: App Store → search "Expo Go"
- Android: Play Store → search "Expo Go"

### 3. Install dependencies

```bash
cd "Atlas Engine APP/atlas-engine-native"
npm install
```

### 4. Configure your Supabase + domain

Edit `app.json`, and add an `extra` block under `expo`:

```json
"expo": {
  ...
  "extra": {
    "ATLAS_ROOT_HOST": "atlasrewards.app",
    "SUPABASE_URL": "https://<your-project-ref>.supabase.co",
    "SUPABASE_ANON": "<your anon public key>"
  }
}
```

(For local development, you can use `192.168.x.x:3000` instead — whatever IP your laptop has on the same WiFi. `lvh.me:3000` won't resolve from your phone.)

### 5. Start Expo

```bash
npm start
```

A QR code appears in your terminal. Open Expo Go on your phone and scan it. The Atlas Engine app loads on your device in ~30 seconds.

### 6. Walk it end-to-end

1. App opens to **Library** — empty state "Scan a code to add your first card"
2. Tap **Scan code** → grant camera permission
3. Go to your existing Next.js app's brand editor → Brand tab → scroll to the Atlas Engine Discovery QR card
4. Point your phone's camera at the screen
5. Within ~1 sec: haptic buzz, the business saves to your library, the WebView opens with the full branded customer app inside Atlas Engine
6. Tap back → you're in the library with the saved business as a beautiful gradient card
7. Tap the card again → it reopens in the WebView. Sign in / sign up works inside the WebView and persists across sessions thanks to `sharedCookiesEnabled`.

## Going to the App Store / Play Store

When you're ready to publish (Phase 2):

### iOS
1. Apple Developer account ($99/year)
2. `eas build --platform ios --profile production`
3. `eas submit --platform ios`

### Android
1. Google Play Developer account ($25 one-time)
2. `eas build --platform android --profile production`
3. `eas submit --platform android`

`eas` (Expo Application Services) is Expo's build/submit tool — free tier covers most apps.

## File tour

| File | What |
|---|---|
| `app.json` | App config — bundle IDs, permissions, splash, plugins |
| `lib/config.ts` | Where Atlas Engine points to (your PWA host + Supabase) |
| `lib/library-store.ts` | AsyncStorage persistence + Supabase API calls |
| `lib/types.ts` | TypeScript types |
| `app/_layout.tsx` | Root stack — tabs vs full-screen WebView |
| `app/(tabs)/_layout.tsx` | Bottom tab bar |
| `app/(tabs)/index.tsx` | Library (saved businesses) |
| `app/(tabs)/scan.tsx` | Camera QR scanner |
| `app/(tabs)/discover.tsx` | Browse all businesses |
| `app/(tabs)/profile.tsx` | Account / version info |
| `app/business/[slug].tsx` | Full-screen WebView wrapper for opened business |

## What's NOT in Atlas Engine v1

- **Web push notifications** — the native shell can receive push (via `expo-notifications`), but wiring the server-side send + per-business token routing is Phase 2
- **Universal links** — scanning the QR outside Atlas Engine doesn't deep-link into the installed app yet; it just opens the browser landing. Universal links require domain verification on both iOS and Android (Phase 2)
- **App icon / splash with your Atlas Engine logo** — placeholders are in place but you'll want to drop your real ATLAS ENGINE logo into `assets/images/icon.png` (1024×1024 PNG) and `splash.png` before submitting to stores
- **Shared account across businesses** — each business handles its own auth via WebView. A "sign in to Atlas Engine once, every business is automatically yours" model is much more work — defer until you have ~10 businesses live

## What works now

- Library with gradient business cards
- Scan flow with haptics + QR decoding for multiple formats
- Discover with search + add-to-library
- Branded WebView with back chrome + remove option
- Per-device library persistence
- Works on iOS, Android, and (mostly) web

Once you've shown a client this running on your phone — a real app that loads their branded rewards experience by scanning a QR — Atlas Rewards stops being "a web app I built" and starts being "a platform I sell."
