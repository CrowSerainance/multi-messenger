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
    () => undefined,
    () => undefined,
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
    await clearGlobalCookies();

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
      throw new Error(
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

    await clearGlobalCookies();
    jarOwner = null;
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

    await clearGlobalCookies();
    jarOwner = null;
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

    await clearGlobalCookies();
    jarOwner = null;

    try {
      await restoreCookieSnapshot(
        targetSnapshot,
      );

      jarOwner = {
        kind: 'account',
        accountId: targetAccountId,
      };
    } catch (error) {
      if (rollbackSnapshot) {
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
