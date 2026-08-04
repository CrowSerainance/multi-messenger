import {
  COOKIE_ORIGINS,
} from '../constants/messenger';

import type {
  CookieSnapshot,
  StoredCookie,
} from '../types/session';

import {
  loadSessionSnapshot,
  saveSessionSnapshot,
} from './cookieVault';

import {
  hasAuthenticationCookies,
  SessionExpiredError,
} from './cookieManager';

import {
  clearProfileCookies,
  clearProfileData,
  deleteWebViewProfile,
  getProfileCookieHeaders,
  setNextWebViewProfile,
  setProfileCookies,
  type ProfileCookieWrite,
} from './profileBackend';

/**
 * Isolated-profile session coordinator (ML-1).
 *
 * Login and Messenger for an account both run inside
 * that account's native WebView profile. Cookie copies
 * through the default jar are avoided: Android's
 * CookieManager only exposes name=value on read, so a
 * copy drops Domain/expiry and Meta then treats the
 * session as invalid — the "one stays logged in, the
 * other logs out" failure mode.
 */

let operationTail: Promise<unknown> =
  Promise.resolve();

function serialized<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = operationTail.then(
    operation,
    operation,
  );

  operationTail = result.catch(() => undefined);

  return result;
}

const AUTH_CHECK_URLS = [
  'https://www.facebook.com/',
  'https://m.facebook.com/',
  'https://www.messenger.com/',
  'https://messenger.com/',
] as const;

function hostFromOrigin(origin: string): string {
  return origin
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();
}

/**
 * Android cookie reads omit Domain. Infer the cookie
 * jar scope from the origin we queried so restores
 * remain valid across facebook/messenger subdomains.
 */
function inferCookieDomain(
  origin: string,
): string | undefined {
  const host = hostFromOrigin(origin);

  if (
    host === 'facebook.com' ||
    host.endsWith('.facebook.com')
  ) {
    return '.facebook.com';
  }

  if (
    host === 'messenger.com' ||
    host.endsWith('.messenger.com')
  ) {
    return '.messenger.com';
  }

  return undefined;
}

function cookieNamesFromHeaders(
  headers: Record<string, string>,
): Set<string> {
  const names = new Set<string>();

  for (const header of Object.values(headers)) {
    for (const pair of header.split(';')) {
      const name = pair.split('=')[0]?.trim();

      if (name) {
        names.add(name);
      }
    }
  }

  return names;
}

async function profileHasAuthCookies(
  profileId: string,
): Promise<boolean> {
  const headers =
    await getProfileCookieHeaders(
      profileId,
      [...AUTH_CHECK_URLS],
    );

  const names =
    cookieNamesFromHeaders(headers);

  return (
    names.has('c_user') && names.has('xs')
  );
}

function isExpired(
  cookie: StoredCookie,
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

function buildCookieWrite(
  cookie: StoredCookie,
): ProfileCookieWrite {
  const domain =
    cookie.domain ??
    inferCookieDomain(cookie.origin);

  const parts = [
    `${cookie.name}=${cookie.value}`,
  ];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  parts.push(`Path=${cookie.path ?? '/'}`);

  if (cookie.expires) {
    const expiresAt = Date.parse(cookie.expires);

    if (!Number.isNaN(expiresAt)) {
      parts.push(
        `Expires=${new Date(expiresAt).toUTCString()}`,
      );
    }
  }

  if (cookie.secure !== false) {
    parts.push('Secure');
  }

  if (cookie.httpOnly) {
    parts.push('HttpOnly');
  }

  return {
    url: cookie.origin,
    cookie: parts.join('; '),
  };
}

function cookieIdentity(
  cookie: StoredCookie,
): string {
  return [
    cookie.name,
    cookie.domain ??
      inferCookieDomain(cookie.origin) ??
      hostFromOrigin(cookie.origin),
    cookie.path ?? '/',
  ].join('|');
}

/**
 * Reads name=value pairs from a profile jar across
 * Messenger cookie origins and rebuilds StoredCookie
 * records with inferred domains for vault backup.
 */
export async function extractCookiesFromProfile(
  profileId: string,
): Promise<StoredCookie[]> {
  const headers =
    await getProfileCookieHeaders(
      profileId,
      [...COOKIE_ORIGINS],
    );

  const result =
    new Map<string, StoredCookie>();

  for (const [origin, header] of Object.entries(
    headers,
  )) {
    if (!header) {
      continue;
    }

    const domain = inferCookieDomain(origin);

    for (const pair of header.split(';')) {
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

      if (!name) {
        continue;
      }

      const stored: StoredCookie = {
        name,
        value,
        origin,
        path: '/',
        secure: true,
        ...(domain ? { domain } : {}),
      };

      result.set(cookieIdentity(stored), stored);
    }
  }

  return [...result.values()];
}

async function importSnapshotUnsafe(
  profileId: string,
  snapshot: CookieSnapshot,
): Promise<void> {
  const usableCookies =
    snapshot.cookies.filter(
      (cookie) => !isExpired(cookie),
    );

  if (!hasAuthenticationCookies(usableCookies)) {
    throw new SessionExpiredError(
      'Saved authentication cookies have expired.',
    );
  }

  await clearProfileCookies(profileId);

  await setProfileCookies(
    profileId,
    usableCookies.map(buildCookieWrite),
  );

  const verified =
    await profileHasAuthCookies(profileId);

  if (!verified) {
    throw new SessionExpiredError(
      'Cookie import completed, but authentication cookies are not visible in the profile.',
    );
  }
}

/**
 * Wipe one profile and bind the next WebView to it.
 * Used before mounting the login WebView so Facebook
 * writes cookies straight into the destination profile.
 */
export async function prepareIsolatedLogin(
  profileId: string,
): Promise<void> {
  return serialized(async () => {
    await clearProfileData(profileId);
    await setNextWebViewProfile(profileId);
  });
}

/**
 * Persist the live profile jar into the encrypted
 * vault (backup / cancel-restore / cold migration).
 */
export async function claimIsolatedLoginSession(
  accountId: string,
  profileId: string,
): Promise<void> {
  return serialized(async () => {
    const cookies =
      await extractCookiesFromProfile(profileId);

    if (!hasAuthenticationCookies(cookies)) {
      throw new SessionExpiredError(
        'Login appeared to succeed, but authentication cookies could not be captured from the profile.',
      );
    }

    const snapshot: CookieSnapshot = {
      schemaVersion: 1,
      accountId,
      capturedAt: Date.now(),
      cookies,
    };

    await saveSessionSnapshot(snapshot);
    await setNextWebViewProfile(profileId);
  });
}

export type IsolatedActivationResult =
  | 'already-resident'
  | 'migrated-from-snapshot';

/**
 * Bind the next Messenger WebView to this account's
 * profile. Migrates a vault snapshot only when the
 * profile has no auth cookies yet (first open after
 * upgrade). Prefer live profile cookies thereafter.
 */
export async function activateIsolatedSession(
  accountId: string,
  profileId: string,
  options?: {
    forceRemigrate?: boolean;
  },
): Promise<IsolatedActivationResult> {
  return serialized(async () => {
    const hasLiveAuth =
      await profileHasAuthCookies(profileId);

    if (hasLiveAuth && !options?.forceRemigrate) {
      await setNextWebViewProfile(profileId);
      return 'already-resident';
    }

    const snapshot =
      await loadSessionSnapshot(accountId);

    if (!snapshot) {
      if (hasLiveAuth) {
        // Remigrate requested but no vault backup —
        // keep the live profile session.
        await setNextWebViewProfile(profileId);
        return 'already-resident';
      }

      throw new SessionExpiredError(
        'No usable saved session exists for this account.',
      );
    }

    await importSnapshotUnsafe(
      profileId,
      snapshot,
    );

    await setNextWebViewProfile(profileId);

    return 'migrated-from-snapshot';
  });
}

export async function isIsolatedSessionAuthenticated(
  profileId: string,
): Promise<boolean> {
  return serialized(() =>
    profileHasAuthCookies(profileId),
  );
}

/**
 * Refresh the vault backup from the live profile jar
 * so cancel-restore and cold migration stay current.
 */
export async function persistIsolatedSession(
  accountId: string,
  profileId: string,
): Promise<'saved' | 'unauthenticated'> {
  return serialized(async () => {
    const cookies =
      await extractCookiesFromProfile(profileId);

    if (!hasAuthenticationCookies(cookies)) {
      return 'unauthenticated';
    }

    await saveSessionSnapshot({
      schemaVersion: 1,
      accountId,
      capturedAt: Date.now(),
      cookies,
    });

    return 'saved';
  });
}

export async function deleteAccountProfile(
  profileId: string,
): Promise<void> {
  return serialized(async () => {
    try {
      await clearProfileData(profileId);
    } catch {
      // Deletion below may still succeed.
    }

    try {
      await deleteWebViewProfile(profileId);
    } catch {
      // Locked by a live WebView; cookies/storage
      // were cleared above when possible.
    }
  });
}
