# Multi-Live Messenger Sessions – Implementation Plan

**Repo:** `CrowSerainance/multi-messenger`  
**Goal:** True multi-account live sessions with instant switching (like having Messenger open in Brave + Chrome + Opera GX at the same time), without triggering Facebook verification/logout storms.  
**Date:** 2026-07-21  
**Status:** Planning → Ready for parallel LLM work

---

## 1. Problem Statement (Current State)

- Single shared cookie jar (`CookieManager` on Android / default WKWebView store on iOS).
- Switching = save cookies → `clearGlobalCookies()` → restore snapshot → remount WebView (`webViewEpoch`).
- Result: Facebook detects cookie swap + storage wipe + sudden session change → forced verification / logout / checkpoint.
- Storage isolation exists (`webStorageIsolation.ts`) but is reactive and incomplete.
- Only one WebView is truly “live” at a time.

**Desired end state:**  
Multiple independent Chromium/WebKit profiles living side-by-side inside the app. Switching is just showing a different already-warm WebView. No cookie clear/restore on normal switches.

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ App (React Native + Expo)                                   │
│                                                             │
│  AccountStore (zustand)                                     │
│  ├── accounts[]                                             │
│  ├── activeAccountId                                        │
│  ├── liveSessions: Map<accountId, LiveSessionHandle>        │
│  └── maxLiveSessions (user setting, default 4)              │
│                                                             │
│  SessionManager (new service)                               │
│  ├── createIsolatedSession(accountId)                       │
│  ├── getOrCreateWebView(accountId)                          │
│  ├── switchTo(accountId)          ← instant, no cookie ops  │
│  ├── evictLRU()                                             │
│  └── persistAll() / restoreOnColdStart()                    │
│                                                             │
│  UI                                                         │
│  └── MultiWebViewContainer                                  │
│      ├── WebView A (account-1)  [visible or hidden]         │
│      ├── WebView B (account-2)  [visible or hidden]         │
│      └── ...                                                │
└─────────────────────────────────────────────────────────────┘
```

### Isolation Layers (in order of strength)

| Layer | Android | iOS | Quality | Effort |
|-------|---------|-----|---------|--------|
| **A. Multiple live WebViews + shared jar** | Easy | Easy | Medium (still shared cookies) | Low |
| **B. `WebView.setDataDirectorySuffix`** | Excellent | N/A | Excellent | Medium |
| **C. Multiple persistent `WKWebsiteDataStore`** | N/A | Excellent (iOS 17+) | Excellent | Medium |
| D. Full multi-process | Overkill | Overkill | Best | Very High |

**Recommended path:** Implement A immediately → then B + C for real isolation.

---

## 3. Phased Implementation Plan

### Phase 0 – Preparation (Do first, 1–2 hours)

- [ ] Create branch: `feat/multi-live-sessions`
- [ ] Add this file to repo root or `docs/MULTI_LIVE_SESSIONS_PLAN.md`
- [ ] Add feature flag: `ENABLE_MULTI_LIVE = true` (in constants or remote config later)
- [ ] Document current pain points in `SessionDiagnosticsScreen` (already exists)
- [ ] Decide max concurrent live sessions (default 3–4 on mid-range phones, 6 on high-end)

**Deliverable:** Clean starting point + this plan committed.

---

### Phase 1 – Multi-WebView Keep-Alive (Quick Win – 1–2 days)

**Goal:** Multiple WebViews stay mounted and warm. Switching = change visibility only. Still uses shared cookie jar, but eliminates most restore-triggered verifications for frequently used accounts.

#### 1.1 New types (`src/types/session.ts`)

```ts
export interface LiveSessionHandle {
  accountId: string;
  createdAt: number;
  lastActiveAt: number;
  webViewKey: string;          // stable key, never changes after creation
  isWarm: boolean;
  // later: dataDirectorySuffix / websiteDataStoreId
}
```

#### 1.2 Extend AccountStore

Add:
- `liveSessions: Record<string, LiveSessionHandle>`
- `maxLiveSessions: number` (persist in secure storage)
- `registerLiveSession(accountId)`
- `touchLiveSession(accountId)`
- `evictLeastRecentlyUsed()`
- `getLiveSessionIds(): string[]`

Keep existing `switchAccount` but make it call the new SessionManager instead of always doing full cookie swap.

#### 1.3 New component: `MultiMessengerContainer.tsx`

- Renders **all** currently live WebViews.
- Only the active one has `style={{ flex: 1 }}`.
- Others: `style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}` or off-screen.
- Each WebView keeps a **stable** `key={accountId}` (remove epoch remount for normal switches).
- Pass `accountId` + isolation props down to `MessengerWebView`.

#### 1.4 Update `MessengerWebView.tsx`

- Accept optional `isActive: boolean`.
- When `!isActive`: pause media, reduce timers if possible (inject JS to pause, or just leave it).
- Keep existing storage guard, but make wipe **optional** when the WebView is already bound to the correct owner.
- On become active: optional light “resume” inject (focus, refresh unread counts, etc.).

#### 1.5 Update switching flow (`sessionCoordinator` + store)

```ts
async function switchToLive(accountId: string) {
  // 1. If already live → just set active + touch
  // 2. If not live and under max → create new live WebView (still shared jar for now)
  // 3. If at max → evict LRU, then create
  // 4. Only fall back to full cookie restore if the target has no live session AND no valid snapshot
}
```

#### 1.6 UI changes

- In switcher sheet: show “Live” badge on warm accounts.
- Add setting: “Max live sessions” (SecuritySettings or new Performance section).
- Optional: “Pin as always-live” per account.

**Success criteria for Phase 1:**
- Switch between 2–3 accounts feels instant.
- No (or dramatically fewer) verification prompts when bouncing between recently used accounts.
- Memory stays acceptable (monitor with Android Studio / Xcode).

---

### Phase 2 – Real Profile Isolation (The Brave/Chrome Equivalent)

This is the real fix.

#### 2.1 Android: `WebView.setDataDirectorySuffix`

**Native work (extend `modules/native-cookies` or new module `modules/webview-profiles`)**

```kotlin
// Must be called BEFORE any WebView is created in that process/context
WebView.setDataDirectorySuffix("msgr_" + suffix)

// Also expose:
// - getCookieString for a specific suffix (harder – may need reflection or per-process)
// - clearDataForSuffix(suffix)
// - list existing suffixes
```

Important notes:
- `setDataDirectorySuffix` is process-wide for the default WebView provider.  
  For true multi-profile inside one process you may need to create WebViews carefully or use AndroidX Webkit helpers.
- Best reliability: one suffix per account, set once when the WebView for that account is first created, and never change it.
- Cookies, localStorage, IndexedDB, cache, service workers become fully isolated automatically.
- Your existing cookie snapshot system becomes a **backup** only (for process death / app data clear).

**React Native side:**
- New prop on WebView wrapper: `dataDirectorySuffix?: string`
- When creating WebView for account → pass `msgr_${accountId.slice(0, 8)}` or hash.
- Store the chosen suffix permanently on the Account object.

#### 2.2 iOS: Multiple `WKWebsiteDataStore`

- On iOS 17+ use the new persistent multi-data-store APIs.
- Create one `WKWebsiteDataStore` per account (or lazy).
- Pass custom `WKWebViewConfiguration` with the correct `websiteDataStore` to each WebView.
- For older iOS: fall back to non-persistent stores + cookie restore, or keep shared.

**Library support:**  
`react-native-webview` does not expose this cleanly today. You will need:
- A thin native module that returns a configuration / or a custom WebView component.
- Or fork / patch `react-native-webview` (document the patch).

#### 2.3 Cookie & Storage Manager updates

Once real isolation exists:
- `extractCurrentCookies` / `restoreCookieSnapshot` become per-profile.
- Storage guard script can be simplified or removed for isolated WebViews (the OS already isolates).
- Keep snapshot system for:
  - Cold start recovery
  - User “Export session” / backup
  - Migration from old shared-jar accounts

#### 2.4 Migration path

- Existing accounts (shared jar) → on first open after upgrade, create new isolated profile and copy cookies into it once, then mark as “migrated”.
- Or force re-login once (cleaner but worse UX).

**Success criteria for Phase 2:**
- Two accounts can be fully logged in, side-by-side, with zero cookie swapping.
- Facebook treats them as completely separate browser profiles.
- Verification almost never triggers on normal switches.

---

### Phase 3 – Polish & Robustness

- [ ] Background freeze / thaw of inactive WebViews (reduce CPU/battery).
- [ ] Memory pressure handling: automatically reduce `maxLiveSessions` or evict.
- [ ] “Refresh session” button that does a soft reload inside the correct profile.
- [ ] Better diagnostics: show which isolation mode each account is using, data dir size, last verification, etc.
- [ ] Optional: per-account User-Agent or client hints spoofing (advanced, risky).
- [ ] Pinning + “Always keep live” + “Hibernate after X minutes”.
- [ ] Export / import account sessions (encrypted).
- [ ] Handle app process death cleanly (restore live set from last known good).

---

## 4. File Change Map (Expected)

```
src/
├── types/session.ts                    # + LiveSessionHandle, isolation fields
├── store/accountStore.ts               # + liveSessions, maxLive, register/evict
├── services/
│   ├── sessionCoordinator.ts           # major rewrite of switch path
│   ├── sessionManager.ts               # NEW – owns live WebView lifecycle
│   ├── cookieManager.ts                # become profile-aware later
│   └── webStorageIsolation.ts          # simplify once real isolation lands
├── components/
│   ├── MessengerWebView.tsx            # + isActive, stable key, isolation props
│   └── MultiMessengerContainer.tsx     # NEW
├── screens/
│   ├── MessengerScreen.tsx             # use MultiMessengerContainer
│   └── SecuritySettingsScreen.tsx      # + Max live sessions slider
modules/
├── native-cookies/                     # extend or replace
└── webview-profiles/                   # NEW (Android setDataDirectorySuffix + iOS data stores)
```

---

## 5. Risk Register & Mitigations

| Risk | Impact | Mitigation |
|------|--------|----------|
| Memory blow-up with many WebViews | High | Hard max (3–5), LRU eviction, memory warning listeners |
| `setDataDirectorySuffix` process-wide quirks | Medium | Test thoroughly on Android 9–16; document limitations |
| iOS < 17 only one persistent store | Medium | Graceful fallback + clear messaging |
| Facebook still fingerprints device | Medium | Accept residual risk; isolation still hugely better than cookie swap |
| Expo / react-native-webview limitations | High | Be ready to eject or use config plugins + native code |
| Cookie migration from old system | Medium | One-time copy or forced re-login with good UX |

---

## 6. Testing Plan

1. **Functional**
   - Create 4 accounts → all stay live → switch rapidly 20 times → no verification.
   - Kill app → cold start → previously live accounts restore correctly.
   - Force clear data for one profile → others untouched.

2. **Memory / Performance**
   - Android Studio Memory Profiler + Xcode Gauges while having 1 / 3 / 5 live sessions.
   - Battery drain over 30 min background.

3. **Facebook-specific**
   - Watch for checkpoint / “Confirm it’s you” after switches.
   - Test with accounts that have 2FA, Trusted Devices, etc.

4. **Edge cases**
   - Switch during active call / voice message.
   - Low storage / low memory.
   - App update while multiple sessions live.

---

## 7. Parallel LLM Work Breakdown (How to use multiple models)

You can split the work cleanly:

| Task | Best given to | Notes |
|------|----------------|-------|
| Phase 1 – MultiWebViewContainer + store changes | Fast coding model (Claude 3.5/4, GPT-4o, Grok, Deepseek) | Pure TS/React Native |
| Phase 1 – MessengerWebView isActive + pause logic | Same | |
| Phase 2 – Android native module (`setDataDirectorySuffix`) | Model good at Kotlin + Expo modules | Needs careful API design |
| Phase 2 – iOS WKWebsiteDataStore multi-store | Model good at Swift + react-native-webview internals | |
| Cookie/storage migration + SessionManager rewrite | Strong reasoning model | Highest risk area |
| UI polish + settings + diagnostics | Any | |
| Testing checklist + edge case hunting | Another model | |

**Prompt template you can reuse:**

```markdown
You are working on the multi-messenger Expo app.
Read the full plan in MULTI_LIVE_SESSIONS_PLAN.md first.
Current task: [exact task from above]
Constraints:
- Do not break existing single-session flow until feature flag is on
- Keep TypeScript strict
- Prefer minimal native code
- Match existing code style (see App.tsx, cookieManager, sessionCoordinator)
Deliver: complete file contents or precise diffs + any new files needed.
```

---

## 8. Definition of Done

- [ ] User can have ≥ 3 accounts fully logged in simultaneously.
- [ ] Switching between live accounts is instant (< 100 ms perceived).
- [ ] No cookie clear/restore happens on normal switches.
- [ ] Facebook verification rate drops dramatically (ideally near zero for warm accounts).
- [ ] Memory usage stays under control with clear user-facing limits.
- [ ] Old accounts migrate cleanly (or one-time re-login with good messaging).
- [ ] Feature is behind a flag and can be turned off.
- [ ] Diagnostics screen shows isolation mode + live status per account.

---

## 9. Open Questions (decide before/during implementation)

1. Default `maxLiveSessions`? (Recommend 3 or 4)
2. Do we force re-login on migration to isolated profiles, or try silent cookie copy?
3. Should “live” WebViews stay alive when the app is backgrounded for a long time, or hibernate after 10–15 min?
4. Do we expose “Open in isolated profile” vs keep the old shared mode as fallback?
5. Minimum Android / iOS version we still support cleanly?

---

## 10. Next Immediate Actions

1. Commit this plan file.
2. Create the feature branch.
3. Implement Phase 1 (Multi-WebView Keep-Alive) first — this alone will feel 80% better.
4. Then tackle native isolation (Phase 2).

---

**End of plan.**  

This document is deliberately self-contained so any LLM (or human) can pick it up and continue without prior context. Update the checkboxes and “Open Questions” section as decisions are made.