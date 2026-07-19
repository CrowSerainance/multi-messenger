import {
  Platform,
} from 'react-native';

import {
  type Cookie,
  type Cookies,
} from '@react-native-cookies/cookies';

import {
  cookieBackend as CookieManager,
} from './cookieBackend';

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

import {
  COOKIE_OPERATION_TIMEOUT_MS,
  withNativeOperationTimeout,
} from './nativeOperation';

import {
  CookieClearError,
  CookieReadError,
  CookieWriteError,
  SessionError,
  SessionExpiredError,
  type NativeOperationName,
} from './sessionErrors';

import {
  recordSessionDiagnostic,
} from './sessionDiagnostics';

export {
  CookieClearError,
  CookieReadError,
  CookieWriteError,
  SessionExpiredError,
} from './sessionErrors';

async function readCookiesWithRetry<T>(
  execute: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (const attempt of [1, 2] as const) {
    try {
      return await withNativeOperationTimeout(
        'cookie-read',
        COOKIE_OPERATION_TIMEOUT_MS,
        execute,
      );
    } catch (error) {
      lastError = error;

      if (attempt === 1) {
        recordSessionDiagnostic({
          event: 'cookie-read-retry',
          operation: 'cookie-read',
          attempt: 1,
          errorCode:
            error instanceof SessionError
              ? error.code
              : 'COOKIE_READ_FAILED',
        });
      }
    }
  }

  recordSessionDiagnostic({
    event: 'native-operation-failed',
    operation: 'cookie-read',
    attempt: 2,
    errorCode: 'COOKIE_READ_FAILED',
  });

  throw new CookieReadError(lastError);
}

async function runCookieMutation<T>(
  operation: Exclude<
    NativeOperationName,
    'cookie-read' | 'secure-read' | 'secure-write' | 'secure-delete'
  >,
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await withNativeOperationTimeout(
      operation,
      COOKIE_OPERATION_TIMEOUT_MS,
      execute,
    );
  } catch (error) {
    const wrapped =
      operation === 'cookie-clear'
        ? new CookieClearError(error)
        : new CookieWriteError(error);

    recordSessionDiagnostic({
      event: 'native-operation-failed',
      operation,
      errorCode: wrapped.code,
    });

    throw wrapped;
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
        (await readCookiesWithRetry(
          () => CookieManager.get(origin),
        )) as Cookies;

      addCookieRecord(
        result,
        cookies,
        origin,
      );
    }

    return [...result.values()];
  }

  let successfulReads = 0;
  let lastReadError: unknown;

  for (const useWebKit of [false, true]) {
    try {
      const allCookies =
        (await readCookiesWithRetry(
          () => CookieManager.getAll(useWebKit),
        )) as Cookies;

      successfulReads += 1;

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
    } catch (error) {
      lastReadError = error;
      // Continue with URL-specific extraction.
    }

    for (const origin of COOKIE_ORIGINS) {
      try {
        const cookies =
          (await readCookiesWithRetry(
            () => CookieManager.get(
              origin,
              useWebKit,
            ),
          )) as Cookies;

        successfulReads += 1;

        addCookieRecord(
          result,
          cookies,
          origin,
        );
      } catch (error) {
        lastReadError = error;
        // Continue collecting from remaining origins.
      }
    }
  }

  if (successfulReads === 0) {
    throw lastReadError instanceof CookieReadError
      ? lastReadError
      : new CookieReadError(lastReadError);
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
      runCookieMutation(
        'cookie-clear',
        () => CookieManager.clearAll(false),
      ),
      runCookieMutation(
        'cookie-clear',
        () => CookieManager.clearAll(true),
      ),
    ]);

    const allFailed = results.every(
      (result) => result.status === 'rejected',
    );

    if (allFailed) {
      throw new CookieClearError();
    }

    return;
  }

  await runCookieMutation(
    'cookie-clear',
    () => CookieManager.clearAll(),
  );
  await runCookieMutation(
    'cookie-flush',
    () => CookieManager.flush(),
  );
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
      runCookieMutation(
        'cookie-write',
        () => CookieManager.set(
          origin,
          cookie,
          false,
        ),
      ),
      runCookieMutation(
        'cookie-write',
        () => CookieManager.set(
          origin,
          cookie,
          true,
        ),
      ),
    ]);

    if (
      results.every(
        (result) =>
          result.status === 'rejected',
      )
    ) {
      throw new CookieWriteError();
    }

    return;
  }

  await runCookieMutation(
    'cookie-write',
    () => CookieManager.set(origin, cookie),
  );
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
    await runCookieMutation(
      'cookie-flush',
      () => CookieManager.flush(),
    );
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
  const cookies =
    await extractCurrentCookies();

  return hasAuthenticationCookies(cookies);
}
