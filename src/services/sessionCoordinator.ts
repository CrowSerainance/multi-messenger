import {
  loadSessionSnapshot,
} from './cookieVault';

import {
  clearGlobalCookies,
  extractCurrentCookies,
  getAccountUserId,
  hasAuthenticationCookies,
  restoreCookieSnapshot,
  saveCurrentSessionFromJar,
  SessionExpiredError,
} from './cookieManager';

import {
  clearAllWebStorage,
} from './cookieBackend';

import {
  waitForPendingCookieMutations,
} from './nativeOperation';

import {
  resetNextWebViewProfile,
} from './profileBackend';

import {
  isNativeOperationTimeout,
  SessionStateError,
} from './sessionErrors';

type JarOwner =
  | {
      kind: 'account';
      accountId: string;
    }
  | {
      kind: 'login';
    }
  | null;

let jarOwner: JarOwner = null;
let operationTail: Promise<void> =
  Promise.resolve();

function exclusive<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = operationTail.then(
    operation,
    operation,
  );

  operationTail = result.then(
    waitForPendingCookieMutations,
    waitForPendingCookieMutations,
  );

  return result;
}

async function captureCurrentOwnerUnsafe():
Promise<void> {
  if (jarOwner?.kind !== 'account') {
    return;
  }

  await saveCurrentSessionFromJar(
    jarOwner.accountId,
  );
}

export async function beginFreshLoginSession():
Promise<void> {
  return exclusive(async () => {
    await captureCurrentOwnerUnsafe();
    jarOwner = null;
    await clearGlobalCookies();

    // Clear web storage natively, once, before the login
    // WebView mounts. Injecting a wipe into the login pages
    // themselves could destroy in-flight authentication state
    // when the flow crosses between messenger.com and
    // facebook.com.
    await clearAllWebStorage();

    // Isolated mode: login always runs in the DEFAULT
    // profile (the shared jar just cleared above), so the
    // pending-profile holder must not leak a previous
    // account's profile into the login WebView.
    await resetNextWebViewProfile();

    jarOwner = {
      kind: 'login',
    };
  });
}

export async function claimLoginSession(
  accountId: string,
): Promise<void> {
  return exclusive(async () => {
    if (jarOwner?.kind !== 'login') {
      throw new SessionStateError(
        'The login session is no longer active, so these cookies cannot be claimed.',
      );
    }

    const saved =
      await saveCurrentSessionFromJar(
        accountId,
      );

    if (!saved) {
      throw new SessionExpiredError(
        'Login appeared to succeed, but authentication cookies could not be captured.',
      );
    }

    jarOwner = {
      kind: 'account',
      accountId,
    };
  });
}

export async function abandonLoginSession():
Promise<void> {
  return exclusive(async () => {
    if (jarOwner?.kind !== 'login') {
      return;
    }

    jarOwner = null;
    await clearGlobalCookies();
  });
}

export async function persistOwnedSession(
  accountId: string,
): Promise<
  'saved' | 'not-owner' | 'unauthenticated'
> {
  return exclusive(async () => {
    if (
      jarOwner?.kind !== 'account' ||
      jarOwner.accountId !== accountId
    ) {
      return 'not-owner';
    }

    const saved =
      await saveCurrentSessionFromJar(
        accountId,
      );

    return saved
      ? 'saved'
      : 'unauthenticated';
  });
}

export async function releaseOwnedSession(
  accountId: string,
): Promise<void> {
  return exclusive(async () => {
    if (
      jarOwner?.kind !== 'account' ||
      jarOwner.accountId !== accountId
    ) {
      return;
    }

    jarOwner = null;
    await clearGlobalCookies();
  });
}

export async function forceClearGlobalSession():
Promise<void> {
  return exclusive(async () => {
    // Best-effort save of the current owner so a
    // manual clear does not discard the freshest
    // cookies silently.
    try {
      await captureCurrentOwnerUnsafe();
    } catch {
      // The jar is being discarded anyway.
    }

    jarOwner = null;
    await clearGlobalCookies();
  });
}

export async function switchGlobalSession(
  targetAccountId: string,
): Promise<void> {
  return exclusive(async () => {
    if (
      jarOwner?.kind === 'account' &&
      jarOwner.accountId === targetAccountId
    ) {
      return;
    }

    const targetSnapshot =
      await loadSessionSnapshot(
        targetAccountId,
      );

    // Validate the target before touching the
    // jar, so a bad snapshot never destroys the
    // currently working session.
    if (
      !targetSnapshot ||
      !hasAuthenticationCookies(
        targetSnapshot.cookies,
      )
    ) {
      throw new SessionExpiredError(
        'No usable saved session exists for this account.',
      );
    }

    // After a cold start the jar owner is
    // unknown, but the jar may already hold this
    // account's freshest cookies. Adopt them
    // instead of overwriting with an older
    // snapshot.
    if (jarOwner === null) {
      const jarCookies =
        await extractCurrentCookies();

      const jarUserId =
        getAccountUserId(jarCookies);

      if (
        jarUserId !== null &&
        jarUserId ===
          getAccountUserId(
            targetSnapshot.cookies,
          ) &&
        hasAuthenticationCookies(jarCookies)
      ) {
        jarOwner = {
          kind: 'account',
          accountId: targetAccountId,
        };

        await saveCurrentSessionFromJar(
          targetAccountId,
        );

        return;
      }
    }

    const previousAccountId =
      jarOwner?.kind === 'account'
        ? jarOwner.accountId
        : null;

    if (previousAccountId) {
      await saveCurrentSessionFromJar(
        previousAccountId,
      );
    }

    const rollbackSnapshot =
      previousAccountId
        ? await loadSessionSnapshot(
            previousAccountId,
          )
        : null;

    jarOwner = null;
    await clearGlobalCookies();

    // Native web-storage clear is the real isolation
    // mechanism between accounts; the in-page guard is only a
    // detector for a genuine owner mismatch.
    await clearAllWebStorage();

    try {
      await restoreCookieSnapshot(
        targetSnapshot,
      );

      jarOwner = {
        kind: 'account',
        accountId: targetAccountId,
      };
    } catch (error) {
      if (
        rollbackSnapshot &&
        !isNativeOperationTimeout(error)
      ) {
        try {
          await clearGlobalCookies();

          await restoreCookieSnapshot(
            rollbackSnapshot,
          );

          jarOwner = {
            kind: 'account',
            accountId:
              rollbackSnapshot.accountId,
          };
        } catch {
          jarOwner = null;
        }
      }

      throw error;
    }
  });
}
