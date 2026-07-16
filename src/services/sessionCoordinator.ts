import {
  loadSessionSnapshot,
} from './cookieVault';

import {
  clearGlobalCookies,
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
      const targetSnapshot =
        await loadSessionSnapshot(
          targetAccountId,
        );

      if (!targetSnapshot) {
        throw new SessionExpiredError(
          'No saved session exists for this account.',
        );
      }

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
