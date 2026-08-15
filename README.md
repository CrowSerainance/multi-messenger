# Messenger Sessions

Run several Facebook Messenger accounts side by side on one Android phone, each in its
own isolated browser profile, behind a local PIN.

This is a personal, self-hosted wrapper around Messenger's web client. It is not
affiliated with, endorsed by, or supported by Meta. It stores nothing off your device.

---

## What it does

- **Multiple accounts, really isolated.** Every account owns a native AndroidX WebKit
  profile. Cookies, local/session storage, IndexedDB, cache, and service workers are
  separated by the OS — not by clearing a shared cookie jar between accounts.
- **Instant switching.** Up to three accounts stay mounted and signed in at once
  (multi-live). Switching changes which one is visible; nothing is unmounted, reloaded,
  or cookie-swapped, so chats, scroll position, and sockets survive. Leaving Messenger
  for another screen in the app does not tear the session down either.
- **Sign-in happens inside the destination profile.** Facebook writes its cookies
  straight into the account's own profile, so signing into one account cannot invalidate
  another.
- **App lock.** A PIN is required before any saved session is readable, with optional
  biometric unlock and a biometric-gated PIN recovery path.
- **Follows your system theme,** light or dark.
- **Screenshots are yours to control** — allowed by default, blockable from Security
  settings.

## Status

Working daily-use build, but **not** a released product:

- Android only. iOS is configured in `app.json` but has no generated native project.
- Release builds are **debug-signed** and use the placeholder application ID
  `com.example.messengersessions`. Fine for sideloading to your own device; not
  distributable.
- Several behaviours are verified by build and unit tests but **not yet on a physical
  device with real accounts** — see [Known limitations](#known-limitations).

The engineering ledger with full history, evidence, and open gates lives outside this
repository at `../MESSENGER_MULTI_ACCOUNT_WRAPPER_HANDOFF.md`.

---

## Requirements

| | |
| --- | --- |
| Node.js | 20+ |
| JDK | 21 (Temurin or the Android Studio JBR) |
| Android SDK | platform-tools + a recent build-tools; Android Studio is the easy path |
| Device | Android with a WebView provider that supports AndroidX `MULTI_PROFILE` (Chrome/Android System WebView 121+). Without it the app falls back to a single-session mode automatically. |

If Gradle refuses to start, check `JAVA_HOME` — it must point at a **complete** JDK:

```bash
java -version
```

## Setup

```bash
npm install
```

`postinstall` runs `patch-package`, which applies two required patches:

- `patches/react-native-webview+13.16.1.patch` — adds `RNCWebViewProfileRegistry` so a
  WebView can be bound to a named profile **before** its first navigation. Multi-account
  isolation does not work without it.
- `patches/@react-native-cookies+cookies+6.2.1.patch` — Gradle repository declaration for
  an archived dependency.

If you ever see accounts sharing a session, verify the first patch actually applied.

## Run

Debug build with Metro attached:

```bash
npx expo run:android
```

Release APK (JS bundle embedded, no Metro needed):

```bash
cd android && ./gradlew.bat :app:assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## Checks

```bash
npm run typecheck
```

```bash
npm test
```

The test suite covers the parts where a bug silently costs you a session: warm-set LRU and
eviction rules, the WebView-creation mutex, and the URL policy that decides what stays in
the session versus what opens in a browser.

---

## How it works

Three modes, chosen at runtime — the app never silently downgrades an account into a
shared cookie jar:

| Mode | When | Switching |
| --- | --- | --- |
| `multi-live` | Flags on + `MULTI_PROFILE` supported | Several WebViews stay warm; a switch changes visibility only |
| `isolated_profile` | `MULTI_PROFILE` supported, multi-live off | One WebView, remounted into the target account's profile. No cookie or storage wipe |
| `legacy_serialized` | No `MULTI_PROFILE` support | The original design: one global cookie jar, saved and restored per switch |

Key pieces:

```
src/components/MultiMessengerContainer.tsx  one warm WebView per account, visibility switching
src/components/MessengerWebView.tsx         a single session: URL policy, lifecycle, isActive gating
src/services/webViewAdmission.ts            mutex over WebView creation (the profile slot is process-global)
src/services/liveSessionManager.ts          warm set, LRU, readiness, busy transactions
src/services/profileCoordinator.ts          isolated login / activate / persist / delete
src/services/profileBackend.ts              capability probe + typed native adapters
src/store/accountStore.ts                   accounts, switching, login claim, deletion
modules/webview-profiles/                   native profile APIs (Kotlin)
modules/native-cookies/                     owned cookie backend (Kotlin)
modules/local-data-reset/                   Android full app-data reset (Kotlin)
```

Feature flags live in `src/constants/features.ts`:

```ts
ENABLE_ISOLATED_PROFILES = true   // per-account native profiles
ENABLE_MULTI_LIVE        = true   // keep several sessions warm
MAX_LIVE_SESSIONS        = 3      // provisional; not yet backed by memory measurements
```

Setting `ENABLE_MULTI_LIVE = false` returns to single-session isolated mode with no data
migration.

### Two User-Agents, on purpose

Login uses a **mobile** UA against `m.facebook.com/login.php`; the session uses a
**desktop** UA against Messenger. Neither is a preference:

- A desktop UA contradicts the Client Hints an Android WebView sends, and Facebook's login
  endpoint answers *"Your Request Couldn't be Processed"*.
- A mobile UA on Messenger gets *"Chats on mobile browsers are not available"* and a
  deep link to the native app.

Do not collapse them into one.

---

## Privacy and security

- Cookies live in Android SecureStore (device-keystore backed) and in each account's
  native WebView profile. They are excluded from Android Auto Backup.
- Cookie names and values are never logged, and never leave the device. The app has no
  analytics, no backend, and no telemetry.
- The PIN is a local gate over keystore-backed storage. It is not itself encrypting your
  Facebook sessions.
- Deleting an account clears and deletes its profile and its encrypted snapshot.
- **Screenshots are allowed by default.** With them allowed, the Android recents/app
  switcher thumbnail can also show conversation content. Turn them off in Security to
  restore `FLAG_SECURE`.
- Messenger itself is Meta's; your use of it stays subject to Meta's terms and privacy
  policy. Meta controls checkpoints and embedded-browser policy — this app reduces session
  churn, it cannot promise verification never happens.

## Known limitations

- Multi-live behaviour (instant switch, history retention, eviction under pressure,
  renderer-death recovery, calls and uploads blocking eviction) is **code-complete and
  build-verified but not device-accepted**.
- `MAX_LIVE_SESSIONS = 3` is provisional — no 1/3/5-WebView memory measurements exist yet.
- Upload detection is an in-page heuristic with a 120-second ceiling, unverified against a
  real attachment.
- Background notifications are out of scope. A mounted WebView does not guarantee delivery
  after process death or app lock.
- Deleting a profile that is still in use fails by design (AndroidX refuses); cleanup is
  best-effort and retried later.
- No iOS build. No automated native/instrumentation tests.

## License

MIT. Note that `LICENSE` is still the template file shipped by `create-expo-app` and
carries Expo's copyright line — replace it with your own before publishing this anywhere.
