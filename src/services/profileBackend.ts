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

/**
 * Safe JS facade for the ML-0 capability probe.
 * Never accepts or returns cookie/session contents.
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

  if (Platform.OS !== 'android') {
    return {
      available: false,
      reason: 'unsupported-platform',
      platform: Platform.OS,
      message:
        'Isolated WebView profiles are Android-first; iOS is ML-5.',
    };
  }

  try {
    const native =
      require('../../modules/webview-profiles')
        .default as import('../../modules/webview-profiles').WebViewProfilesModule;

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
}
