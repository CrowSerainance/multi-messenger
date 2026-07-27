import { requireNativeModule } from 'expo-modules-core';

export interface WebViewProfileCapability {
  platform: 'android';
  multiProfileSupported: boolean;
  multiProcessEnabled: boolean | null;
  multiProcessFeatureSupported: boolean;
  providerPackageName: string;
  providerVersionName: string;
  providerVersionCode: number;
  androidSdkInt: number;
  webkitFeatureConstants: {
    MULTI_PROFILE: string;
    MULTI_PROCESS: string;
  };
}

export interface ProfileSelfTestResult {
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

export interface WebViewProfilesModule {
  getCapability(): Promise<WebViewProfileCapability>;
  /**
   * ML-0 isolation self-test: exercises ProfileStore
   * create/list/delete and setProfile-before-load on a
   * throwaway WebView. Returns booleans only.
   */
  runProfileSelfTest(): Promise<ProfileSelfTestResult>;
}

// Throws on platforms where the native module was not built.
export default requireNativeModule<WebViewProfilesModule>(
  'WebViewProfiles',
);
