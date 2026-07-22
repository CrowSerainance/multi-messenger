# Multi-Live Messenger Sessions - Implementation Plan

> **CORRECTION BANNER (authoritative)**
>
> This directory imports the external draft from
> `E:\MMORPG\MULTI_LIVE_SESSIONS_PLAN.md`.
>
> - The raw draft is preserved as
>   [`MULTI_LIVE_SESSIONS_PLAN.external.md`](./MULTI_LIVE_SESSIONS_PLAN.external.md).
> - **`MESSENGER_MULTI_ACCOUNT_WRAPPER_HANDOFF.md` Section 0
>   ("Multi-live overhaul control plane") takes precedence** wherever
>   that draft conflicts.
>
> Corrections that override the external draft:
>
> 1. **Do not implement shared-jar multi-WebView keep-alive** as a real
>    multi-account solution. Multiple mounted WebViews on the global
>    `CookieManager` cannot safely represent different Facebook accounts.
> 2. **Do not use one `setDataDirectorySuffix` per WebView** as a profile
>    selector; that API is process-global.
> 3. **Preferred Android path:** AndroidX WebKit `MULTI_PROFILE` via
>    `WebViewCompat.setProfile` + `ProfileStore`, behind feature flags
>    that default **off**.
> 4. Work is tracked as **ML-0 through ML-5** in the handoff, not the
>    draft's Phase 0-N numbering.
> 5. Branch: `feat/multi-live-sessions`. Flags:
>    `ENABLE_ISOLATED_PROFILES` and `ENABLE_MULTI_LIVE` (both default off).
>
> Read the handoff first. Use `.external.md` only as historical context.

## Current ML-0 prep status (this branch)

Completed in repo prep (no device required):

- [x] Branch `feat/multi-live-sessions`
- [x] This plan doc + correction banner + external draft copy
- [x] Feature flags in `src/constants/features.ts` (both off)
- [x] `modules/webview-profiles` capability-query scaffold

Still required before ML-0 exit:

- [ ] Physical-device release/login/switch smoke baseline
- [ ] Prove two AndroidX WebView profiles on a physical device
- [ ] Record WebView provider support matrix
- [ ] Prototype `setProfile` before first navigation (native WebView extension)

## Pointers

| Document | Role |
| --- | --- |
| `../MESSENGER_MULTI_ACCOUNT_WRAPPER_HANDOFF.md` Section 0 | Execution source of truth |
| `./MULTI_LIVE_SESSIONS_PLAN.external.md` | Original brainstorming draft |
| `src/constants/features.ts` | Build-time flags (off) |
| `modules/webview-profiles` | Android capability probe scaffold |
