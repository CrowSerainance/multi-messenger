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

export interface ProfileCookieWrite {
  /** URL the cookie applies to (scheme + host). */
  url: string;
  /** Full Set-Cookie value including attributes. */
  cookie: string;
}

export interface WebViewProfilesModule {
  getCapability(): Promise<WebViewProfileCapability>;
  /**
   * ML-0 isolation self-test: exercises ProfileStore
   * create/list/delete and setProfile-before-load on a
   * throwaway WebView. Returns booleans only.
   */
  runProfileSelfTest(): Promise<ProfileSelfTestResult>;

  /**
   * ML-1: the NEXT created WebView binds to this profile
   * (via the patched react-native-webview factory). Pass
   * null to restore the default profile.
   */
  setNextWebViewProfile(
    profileName: string | null,
  ): Promise<void>;

  /** Cookie header per URL ("a=1; b=2"), profile-scoped. */
  getProfileCookies(
    profileName: string,
    urls: string[],
  ): Promise<Record<string, string>>;

  setProfileCookies(
    profileName: string,
    cookies: ProfileCookieWrite[],
  ): Promise<void>;

  clearProfileCookies(
    profileName: string,
  ): Promise<void>;

  /**
   * Clears one profile's cookies + web storage.
   * Used before login into that profile.
   */
  clearProfileData(
    profileName: string,
  ): Promise<void>;

  /** Best-effort; false when the profile is still in use. */
  deleteProfile(
    profileName: string,
  ): Promise<boolean>;

  listProfiles(): Promise<string[]>;
}

// Throws on platforms where the native module was not built.
export default requireNativeModule<WebViewProfilesModule>(
  'WebViewProfiles',
);
