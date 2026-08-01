import type {
  CookieSnapshot,
  StoredCookie,
} from '../types/session';

import {
  loadSessionSnapshot,
} from './cookieVault';

import {
  SessionExpiredError,
} from './sessionErrors';

import {
  clearProfileCookies,
  deleteWebViewProfile,
  getProfileCookieHeaders,
  setNextWebViewProfile,
  setProfileCookies,
  type ProfileCookieWrite,
} from './profileBackend';

/**
 * Isolated-profile session coordinator (ML-1).
 *
 * Legacy switching wipes the one shared cookie jar and
 * all web storage on every swap, which is why chat
 * history had to re-sync each time. In isolated mode
 * every account owns a native WebView profile: cookies,
 * local/session storage, IndexedDB, and the HTTP cache
 * all persist per account, so a switch is just "bind
 * the next WebView to the target account's profile".
 *
 * All operations are serialized on one promise chain so
 * a switch can never interleave with a migration.
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
  'https://www.messenger.com/',
] as const;

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
  const parts = [
    `${cookie.name}=${cookie.value}`,
  ];

  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`);
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

  if (cookie.secure) {
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

async function importSnapshotUnsafe(
  profileId: string,
  snapshot: CookieSnapshot,
): Promise<void> {
  const usableCookies =
    snapshot.cookies.filter(
      (cookie) => !isExpired(cookie),
    );

  const names = new Set(
    usableCookies.map((cookie) => cookie.name),
  );

  if (
    !names.has('c_user') ||
    !names.has('xs')
  ) {
    throw new SessionExpiredError(
      'Saved authentication cookies have expired.',
    );
  }

  // Old contents go first so a reauthentication can
  // never mix a fresh xs with a stale one.
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

export type IsolatedActivationResult =
  | 'already-resident'
  | 'migrated-from-snapshot';

/**
 * Makes `profileId` the profile the next Messenger
 * WebView will bind to, migrating the account's saved
 * cookie snapshot into the profile the first time (so
 * existing accounts do not need to re-login).
 *
 * Throws SessionExpiredError when neither the profile
 * nor the vault holds a usable session; the caller
 * routes to reauthentication, exactly like legacy.
 */
export async function activateIsolatedSession(
  accountId: string,
  profileId: string,
): Promise<IsolatedActivationResult> {
  return serialized(async () => {
    if (
      await profileHasAuthCookies(profileId)
    ) {
      await setNextWebViewProfile(profileId);
      return 'already-resident';
    }

    const snapshot =
      await loadSessionSnapshot(accountId);

    if (!snapshot) {
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

/**
 * Imports a just-captured login snapshot into the
 * account's profile and makes that profile pending for
 * the next WebView. Used right after claimLoginSession.
 */
export async function adoptLoginSnapshotIntoProfile(
  accountId: string,
  profileId: string,
): Promise<void> {
  return serialized(async () => {
    const snapshot =
      await loadSessionSnapshot(accountId);

    if (!snapshot) {
      throw new SessionExpiredError(
        'Login succeeded but no captured session snapshot was found.',
      );
    }

    await importSnapshotUnsafe(
      profileId,
      snapshot,
    );

    await setNextWebViewProfile(profileId);
  });
}

/**
 * Lightweight liveness check used by the periodic
 * persist path and the in-page expiry detector.
 */
export async function isIsolatedSessionAuthenticated(
  profileId: string,
): Promise<boolean> {
  return serialized(() =>
    profileHasAuthCookies(profileId),
  );
}

/**
 * Best-effort account-profile removal: cookies are
 * cleared even when the profile object itself is still
 * referenced by a live WebView and cannot be deleted
 * yet (deleteProfile then reports false).
 */
export async function deleteAccountProfile(
  profileId: string,
): Promise<void> {
  return serialized(async () => {
    try {
      await clearProfileCookies(profileId);
    } catch {
      // Deletion below may still succeed.
    }

    try {
      await deleteWebViewProfile(profileId);
    } catch {
      // Locked by a live WebView; cookies are gone,
      // and orphaned empty profiles are harmless.
    }
  });
}
