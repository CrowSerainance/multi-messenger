import {
  Platform,
} from 'react-native';

import CookieManager, {
  type Cookie,
  type Cookies,
} from '@react-native-cookies/cookies';

import {
  COOKIE_ORIGINS,
} from '../constants/messenger';

import type {
  CookieSnapshot,
  StoredCookie,
} from '../types/session';

import {
  saveSessionSnapshot,
} from './cookieVault';

export class SessionExpiredError extends Error {
  constructor(message = 'Saved session is no longer usable.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

function hostFromOrigin(origin: string): string {
  return origin
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();
}

function normalizeDomain(domain: string): string {
  return domain
    .replace(/^\./, '')
    .toLowerCase();
}

function isTargetDomain(domain?: string): boolean {
  if (!domain) {
    return false;
  }

  const normalized = normalizeDomain(domain);

  return (
    normalized === 'facebook.com' ||
    normalized.endsWith('.facebook.com') ||
    normalized === 'messenger.com' ||
    normalized.endsWith('.messenger.com')
  );
}

function cookieRestoreOrigin(
  cookie: Cookie,
  fallbackOrigin: string,
): string {
  if (!cookie.domain) {
    return fallbackOrigin;
  }

  return `https://${normalizeDomain(cookie.domain)}/`;
}

function cookieIdentity(
  cookie: StoredCookie,
): string {
  return [
    cookie.name,
    cookie.domain ?? hostFromOrigin(cookie.origin),
    cookie.path ?? '/',
  ].join('|');
}

function isExpired(
  cookie: Cookie,
  now = Date.now(),
): boolean {
  if (!cookie.expires) {
    return false;
  }

  const expiresAt = Date.parse(cookie.expires);

  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= now;
}

export function getAccountUserId(
  cookies: StoredCookie[],
): string | null {
  const cookie = cookies.find(
    (candidate) =>
      candidate.name === 'c_user' &&
      !isExpired(candidate),
  );

  return cookie?.value ?? null;
}

export function hasAuthenticationCookies(
  cookies: StoredCookie[],
): boolean {
  const validNames = new Set(
    cookies
      .filter((cookie) => !isExpired(cookie))
      .map((cookie) => cookie.name),
  );

  return (
    validNames.has('c_user') &&
    validNames.has('xs')
  );
}

function addCookieRecord(
  destination: Map<string, StoredCookie>,
  record: Cookies,
  fallbackOrigin: string,
): void {
  Object.values(record).forEach((cookie) => {
    const cookieDomain =
      cookie.domain ?? hostFromOrigin(fallbackOrigin);

    if (!isTargetDomain(cookieDomain)) {
      return;
    }

    const stored: StoredCookie = {
      ...cookie,
      origin: cookieRestoreOrigin(
        cookie,
        fallbackOrigin,
      ),
    };

    destination.set(
      cookieIdentity(stored),
      stored,
    );
  });
}

export async function extractCurrentCookies():
Promise<StoredCookie[]> {
  const result =
    new Map<string, StoredCookie>();

  if (Platform.OS === 'android') {
    for (const origin of COOKIE_ORIGINS) {
      const cookies =
        (await CookieManager.get(origin)) as Cookies;

      addCookieRecord(
        result,
        cookies,
        origin,
      );
    }

    return [...result.values()];
  }

  for (const useWebKit of [false, true]) {
    try {
      const allCookies =
        (await CookieManager.getAll(
          useWebKit,
        )) as Cookies;

      Object.values(allCookies).forEach((cookie) => {
        if (!isTargetDomain(cookie.domain)) {
          return;
        }

        const stored: StoredCookie = {
          ...cookie,
          origin: cookieRestoreOrigin(
            cookie,
            'https://www.facebook.com/',
          ),
        };

        result.set(
          cookieIdentity(stored),
          stored,
        );
      });
    } catch {
      // Continue with URL-specific extraction.
    }

    for (const origin of COOKIE_ORIGINS) {
      try {
        const cookies =
          (await CookieManager.get(
            origin,
            useWebKit,
          )) as Cookies;

        addCookieRecord(
          result,
          cookies,
          origin,
        );
      } catch {
        // Continue collecting from remaining origins.
      }
    }
  }

  return [...result.values()];
}

export async function saveCurrentSessionFromJar(
  accountId: string,
): Promise<boolean> {
  const cookies = await extractCurrentCookies();

  if (!hasAuthenticationCookies(cookies)) {
    return false;
  }

  const snapshot: CookieSnapshot = {
    schemaVersion: 1,
    accountId,
    capturedAt: Date.now(),
    cookies,
  };

  await saveSessionSnapshot(snapshot);
  return true;
}

export async function clearGlobalCookies():
Promise<void> {
  if (Platform.OS === 'ios') {
    const results = await Promise.allSettled([
      CookieManager.clearAll(false),
      CookieManager.clearAll(true),
    ]);

    const allFailed = results.every(
      (result) => result.status === 'rejected',
    );

    if (allFailed) {
      throw new Error(
        'Unable to clear either iOS cookie store.',
      );
    }

    return;
  }

  await CookieManager.clearAll();
  await CookieManager.flush();
}

async function setCookie(
  storedCookie: StoredCookie,
): Promise<void> {
  const {
    origin,
    ...cookie
  } = storedCookie;

  if (Platform.OS === 'ios') {
    const results = await Promise.allSettled([
      CookieManager.set(
        origin,
        cookie,
        false,
      ),
      CookieManager.set(
        origin,
        cookie,
        true,
      ),
    ]);

    if (
      results.every(
        (result) =>
          result.status === 'rejected',
      )
    ) {
      throw new Error(
        `Failed to restore cookie ${cookie.name}`,
      );
    }

    return;
  }

  await CookieManager.set(origin, cookie);
}

export async function restoreCookieSnapshot(
  snapshot: CookieSnapshot,
): Promise<void> {
  const usableCookies =
    snapshot.cookies.filter(
      (cookie) => !isExpired(cookie),
    );

  if (
    !hasAuthenticationCookies(usableCookies)
  ) {
    throw new SessionExpiredError(
      'Saved authentication cookies have expired.',
    );
  }

  for (const cookie of usableCookies) {
    await setCookie(cookie);
  }

  if (Platform.OS === 'android') {
    await CookieManager.flush();
  }

  const verified =
    await isCurrentJarAuthenticated();

  if (!verified) {
    throw new SessionExpiredError(
      'Cookie restoration completed, but authentication cookies are not available.',
    );
  }
}

export async function isCurrentJarAuthenticated():
Promise<boolean> {
  try {
    const cookies =
      await extractCurrentCookies();

    return hasAuthenticationCookies(cookies);
  } catch {
    return false;
  }
}
