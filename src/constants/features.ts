/**
 * Multi-live / isolated-profile feature flags.
 *
 * - ENABLE_ISOLATED_PROFILES (ML-1, ON): each account owns a native
 *   AndroidX WebKit profile; switching binds the next WebView to the
 *   target profile instead of wiping the shared jar + web storage.
 *   Runtime capability is still verified (resolveSessionMode); devices
 *   without MULTI_PROFILE fall back to the legacy serialized switch.
 * - ENABLE_MULTI_LIVE (ML-3, ON): keep more than one isolated WebView
 *   mounted at once so switching changes visibility only — no remount,
 *   no reload, no lost chat history. Requires ENABLE_ISOLATED_PROFILES
 *   and a runtime MULTI_PROFILE capability; anything else falls back to
 *   the single-WebView path. Shared-jar multi-WebView keep-alive stays
 *   prohibited: every live WebView must own a native profile.
 */

export const ENABLE_ISOLATED_PROFILES: boolean = true;

export const ENABLE_MULTI_LIVE: boolean = true;

/**
 * Warm isolated sessions kept mounted at once, including the
 * active one. Provisional Android default from the handoff; do
 * not raise it without 1/3/5-WebView memory measurements on a
 * mid-range physical device.
 */
export const MAX_LIVE_SESSIONS = 3;

export function isIsolatedProfilesEnabled(): boolean {
  return ENABLE_ISOLATED_PROFILES;
}

export function isMultiLiveEnabled(): boolean {
  return ENABLE_ISOLATED_PROFILES && ENABLE_MULTI_LIVE;
}
