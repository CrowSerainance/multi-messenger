import { Platform } from 'react-native';

import LibCookieManager, {
  type Cookie,
  type Cookies,
} from '@react-native-cookies/cookies';

/**
 * Cookie backend abstraction.
 *
 * The archived `@react-native-cookies/cookies`
 * package remains the iOS backend (no native iOS
 * project is generated yet), but on Android every
 * cookie operation is routed through the owned
 * `native-cookies` Expo module so the app does
 * not depend on the unmaintained library at
 * runtime on its primary platform. Both backends
 * present the same subset interface the session
 * layer uses, so `cookieManager.ts` is unaware of
 * which one is active.
 */
export interface CookieBackend {
  get(
    url: string,
    useWebKit?: boolean,
  ): Promise<Cookies>;
  getAll(
    useWebKit?: boolean,
  ): Promise<Cookies>;
  set(
    url: string,
    cookie: Cookie,
    useWebKit?: boolean,
  ): Promise<boolean>;
  clearAll(
    useWebKit?: boolean,
  ): Promise<boolean>;
  flush(): Promise<void>;
}

function parseCookieString(
  raw: string,
): Cookies {
  const cookies: Cookies = {};

  if (!raw) {
    return cookies;
  }

  for (const pair of raw.split(';')) {
    const separator = pair.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const name = pair
      .slice(0, separator)
      .trim();

    const value = pair
      .slice(separator + 1)
      .trim();

    if (name.length === 0) {
      continue;
    }

    // Android WebView exposes only name/value;
    // domain, path, and expiry come from the JS
    // snapshot when the cookie is restored.
    cookies[name] = {
      name,
      value,
    };
  }

  return cookies;
}

function serializeCookie(
  cookie: Cookie,
): string {
  const parts = [
    `${cookie.name}=${cookie.value ?? ''}`,
  ];

  if (cookie.domain) {
    parts.push(
      `Domain=${cookie.domain}`,
    );
  }

  parts.push(
    `Path=${cookie.path ?? '/'}`,
  );

  if (cookie.expires) {
    parts.push(
      `Expires=${cookie.expires}`,
    );
  }

  if (cookie.secure) {
    parts.push('Secure');
  }

  if (cookie.httpOnly) {
    parts.push('HttpOnly');
  }

  return parts.join('; ');
}

function createAndroidBackend():
CookieBackend {
  // Required lazily so Metro never evaluates the
  // native-module binding on platforms where it
  // was not built.
  const native =
    require('../../modules/native-cookies')
      .default as import('../../modules/native-cookies').NativeCookiesModule;

  return {
    async get(url) {
      const raw =
        await native.getCookieString(url);

      return parseCookieString(raw);
    },

    async getAll() {
      // The WebView cookie store cannot be
      // enumerated globally; Android callers read
      // per-origin via get().
      return {};
    },

    async set(url, cookie) {
      return native.setCookie(
        url,
        serializeCookie(cookie),
      );
    },

    async clearAll() {
      return native.clearAll();
    },

    async flush() {
      await native.flush();
    },
  };
}

export const cookieBackend: CookieBackend =
  Platform.OS === 'android'
    ? createAndroidBackend()
    : (LibCookieManager as unknown as CookieBackend);
