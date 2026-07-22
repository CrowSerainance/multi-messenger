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

export interface WebViewProfilesModule {
  getCapability(): Promise<WebViewProfileCapability>;
}

// Throws on platforms where the native module was not built.
export default requireNativeModule<WebViewProfilesModule>(
  'WebViewProfiles',
);
