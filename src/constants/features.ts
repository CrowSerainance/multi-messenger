/**
 * Multi-live / isolated-profile feature flags.
 *
 * - ENABLE_ISOLATED_PROFILES (ML-1, ON): each account owns a native
 *   AndroidX WebKit profile; switching binds the next WebView to the
 *   target profile instead of wiping the shared jar + web storage.
 *   Runtime capability is still verified (resolveSessionMode); devices
 *   without MULTI_PROFILE fall back to the legacy serialized switch.
 * - ENABLE_MULTI_LIVE (OFF): mount more than one isolated WebView at
 *   once. Requires ENABLE_ISOLATED_PROFILES. Shared-jar multi-WebView
 *   keep-alive is prohibited by the handoff control plane.
 */

export const ENABLE_ISOLATED_PROFILES: boolean = true;

export const ENABLE_MULTI_LIVE: boolean = false;

export function isIsolatedProfilesEnabled(): boolean {
  return ENABLE_ISOLATED_PROFILES;
}

export function isMultiLiveEnabled(): boolean {
  return ENABLE_ISOLATED_PROFILES && ENABLE_MULTI_LIVE;
}
