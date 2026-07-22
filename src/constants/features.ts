/**
 * Multi-live / isolated-profile feature flags.
 *
 * Both default OFF. Incomplete native profile work must never become
 * reachable in a release build through a casually flipped constant.
 *
 * - ENABLE_ISOLATED_PROFILES: native AndroidX WebKit profile data plane
 * - ENABLE_MULTI_LIVE: mount more than one isolated WebView at once
 *
 * ENABLE_MULTI_LIVE requires ENABLE_ISOLATED_PROFILES. Shared-jar
 * multi-WebView keep-alive is prohibited by the handoff control plane.
 */

export const ENABLE_ISOLATED_PROFILES: boolean = false;

export const ENABLE_MULTI_LIVE: boolean = false;

export function isIsolatedProfilesEnabled(): boolean {
  return ENABLE_ISOLATED_PROFILES;
}

export function isMultiLiveEnabled(): boolean {
  return ENABLE_ISOLATED_PROFILES && ENABLE_MULTI_LIVE;
}
