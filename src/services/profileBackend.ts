import { Platform } from 'react-native';

import {
  isIsolatedProfilesEnabled,
} from '../constants/features';

export type WebViewProfileCapabilityReport =
  | {
      available: false;
      reason:
        | 'flag-disabled'
        | 'unsupported-platform'
        | 'native-module-missing'
        | 'native-error';
      platform: typeof Platform.OS;
      message?: string;
    }
  | {
      available: true;
      platform: 'android';
      multiProfileSupported: boolean;
      multiProcessEnabled: boolean | null;
      multiProcessFeatureSupported: boolean;
      providerPackageName: string;
      providerVersionName: string;
      providerVersionCode: number;
      androidSdkInt: number;
    };

type NativeModule =
  import('../../modules/webview-profiles').WebViewProfilesModule;

/**
 * Resolves the native binding, or throws with a
 * marker so the caller can distinguish "the
 * module was never built/registered" from "the
 * module is present but its call failed".
 */
function resolveNativeModule(): NativeModule {
  // requireNativeModule throws at import time when
  // the native module is absent (e.g. iOS, or a
  // build that did not link it).
  return require('../../modules/webview-profiles')
    .default as NativeModule;
}

/**
 * Platform + native probe, independent of the
 * feature flag. Kept private so production callers
 * must go through the flag-gated entry point.
 */
async function probeCapability():
Promise<WebViewProfileCapabilityReport> {
  if (Platform.OS !== 'android') {
    return {
      available: false,
      reason: 'unsupported-platform',
      platform: Platform.OS,
      message:
        'Isolated WebView profiles are Android-first; iOS is ML-5.',
    };
  }

  let native: NativeModule;

  try {
    native = resolveNativeModule();
  } catch (error) {
    // Import/registration failure: the module is
    // not present in this build.
    return {
      available: false,
      reason: 'native-module-missing',
      platform: Platform.OS,
      message:
        error instanceof Error
          ? error.message
          : 'WebViewProfiles native module is unavailable.',
    };
  }

  try {
    const capability = await native.getCapability();

    return {
      available: true,
      platform: 'android',
      multiProfileSupported:
        capability.multiProfileSupported,
      multiProcessEnabled:
        capability.multiProcessEnabled,
      multiProcessFeatureSupported:
        capability.multiProcessFeatureSupported,
      providerPackageName:
        capability.providerPackageName,
      providerVersionName:
        capability.providerVersionName,
      providerVersionCode:
        capability.providerVersionCode,
      androidSdkInt: capability.androidSdkInt,
    };
  } catch (error) {
    // The module is present but the native call
    // itself failed.
    return {
      available: false,
      reason: 'native-error',
      platform: Platform.OS,
      message:
        error instanceof Error
          ? error.message
          : 'WebViewProfiles.getCapability() threw.',
    };
  }
}

/**
 * Safe JS facade for the ML-0 capability probe.
 * Never accepts or returns cookie/session contents.
 * Returns `flag-disabled` unless the isolated-profile
 * flag is on, so production code cannot reach the
 * native probe while the feature is dark.
 */
export async function getWebViewProfileCapability():
Promise<WebViewProfileCapabilityReport> {
  if (!isIsolatedProfilesEnabled()) {
    return {
      available: false,
      reason: 'flag-disabled',
      platform: Platform.OS,
      message:
        'ENABLE_ISOLATED_PROFILES is false; native profile APIs stay dark.',
    };
  }

  return probeCapability();
}

/**
 * Development-only accessor that bypasses the
 * feature flag so the ML-0 capability spike can be
 * recorded without enabling isolated mode. Still
 * read-only and free of session data. Must never be
 * wired into a production/release code path.
 */
export async function getWebViewProfileCapabilityForDiagnostics():
Promise<WebViewProfileCapabilityReport> {
  return probeCapability();
}

export interface ProfileSelfTestReport {
  ran: boolean;
  multiProfileSupported: boolean;
  createdTwoProfiles?: boolean;
  profileCount?: number;
  setProfileBeforeLoad?: boolean;
  cookieIsolation?: boolean;
  clearOneKeepsOther?: boolean;
  error?: string;
  errorMessage?: string;
}

/**
 * Development-only ML-0 isolation self-test. Drives
 * the native ProfileStore create/list/delete plus a
 * setProfile-before-load check on a throwaway
 * WebView. Returns booleans only; never touches
 * Facebook sessions or real account profiles.
 */
export async function runWebViewProfileSelfTest():
Promise<ProfileSelfTestReport> {
  if (Platform.OS !== 'android') {
    return {
      ran: false,
      multiProfileSupported: false,
      error: 'unsupported-platform',
    };
  }

  try {
    const native = resolveNativeModule();
    return await native.runProfileSelfTest();
  } catch (error) {
    return {
      ran: false,
      multiProfileSupported: false,
      error:
        error instanceof Error
          ? error.message
          : 'runProfileSelfTest unavailable.',
    };
  }
}
