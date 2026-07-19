import { requireNativeModule } from 'expo-modules-core';

export interface NativeCookiesModule {
  /** Returns the raw "name=value; name2=value2" string for the origin, or "". */
  getCookieString(url: string): Promise<string>;
  /** Sets one serialized Set-Cookie style string against the origin. */
  setCookie(url: string, cookie: string): Promise<boolean>;
  /** Removes every cookie in the shared WebView jar, then flushes. */
  clearAll(): Promise<boolean>;
  /** Persists pending cookie writes to disk. */
  flush(): Promise<void>;
}

// Throws on any platform where the native module was not built (e.g. iOS,
// which still uses the library backend). Callers must guard by Platform.OS.
export default requireNativeModule<NativeCookiesModule>(
  'NativeCookies',
);
