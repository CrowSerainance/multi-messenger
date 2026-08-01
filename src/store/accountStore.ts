import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import type {
  Account,
  AccountIndex,
} from '../types/session';

import {
  abandonLoginSession,
  claimLoginSession,
  forceClearGlobalSession,
  persistOwnedSession,
  releaseOwnedSession,
  switchGlobalSession,
} from '../services/sessionCoordinator';

import {
  deleteSessionSnapshot,
} from '../services/cookieVault';

import {
  secureReadJson,
  secureWriteJson,
} from '../services/secureJson';

import {
  SessionExpiredError,
} from '../services/cookieManager';

import {
  resolveSessionMode,
} from '../services/profileBackend';

import {
  activateIsolatedSession,
  adoptLoginSnapshotIntoProfile,
  deleteAccountProfile,
  isIsolatedSessionAuthenticated,
} from '../services/profileCoordinator';

const ACCOUNT_INDEX_KEY =
  'messenger.accounts.index.v1';

export type LoginCancellationDestination =
  | 'home'
  | 'messenger';

export type SessionRefreshResult =
  | 'saved'
  | 'not-owner'
  | 'unauthenticated'
  | 'no-active';

export type AccountMoveDirection =
  | 'up'
  | 'down';

interface AccountStore {
  accounts: Account[];
  activeAccountId: string | null;
  defaultAccountId: string | null;
  hydrated: boolean;
  isSwitching: boolean;
  webViewEpoch: number;
  error: string | null;

  hydrate(): Promise<void>;

  createAccountFromLogin(
    name: string,
  ): Promise<string>;

  replaceAccountFromLogin(
    accountId: string,
  ): Promise<void>;

  cancelLogin():
  Promise<LoginCancellationDestination>;

  switchAccount(
    accountId: string,
  ): Promise<void>;

  persistActiveSession():
  Promise<SessionRefreshResult>;

  markExpired(
    accountId: string,
  ): Promise<void>;

  renameAccount(
    accountId: string,
    name: string,
  ): Promise<void>;

  moveAccount(
    accountId: string,
    direction: AccountMoveDirection,
  ): Promise<void>;

  setDefaultAccount(
    accountId: string | null,
  ): Promise<void>;

  forceClearCookies(): Promise<void>;

  removeAccount(
    accountId: string,
  ): Promise<void>;
}

function newProfileId(): string {
  return `acct-${Crypto.randomUUID()}`;
}

/**
 * Puts a just-claimed login session into the account's
 * isolated profile (isolated mode only). On any failure
 * the shared jar still holds the live session and the
 * pending-profile holder was never changed, so the
 * Messenger WebView simply mounts against the default
 * profile like legacy — never a broken state.
 */
async function adoptLoginIntoIsolatedProfile(
  accountId: string,
  existingProfileId?: string,
): Promise<string | undefined> {
  if (
    (await resolveSessionMode()) !== 'isolated'
  ) {
    return existingProfileId;
  }

  const profileId =
    existingProfileId ?? newProfileId();

  try {
    await adoptLoginSnapshotIntoProfile(
      accountId,
      profileId,
    );
  } catch {
    return existingProfileId;
  }

  // The profile owns the session now; scrub the copy
  // left in the shared jar.
  try {
    await releaseOwnedSession(accountId);
  } catch {
    // Residue in the shared jar is cleared by the
    // next login flow anyway.
  }

  return profileId;
}

async function saveIndex(
  accounts: Account[],
  activeAccountId: string | null,
  defaultAccountId: string | null,
): Promise<void> {
  const index: AccountIndex = {
    accounts,
    activeAccountId,
    defaultAccountId,
  };

  await secureWriteJson(
    ACCOUNT_INDEX_KEY,
    index,
  );
}

export const useAccountStore =
  create<AccountStore>((set, get) => ({
    accounts: [],
    activeAccountId: null,
    defaultAccountId: null,
    hydrated: false,
    isSwitching: false,
    webViewEpoch: 0,
    error: null,

    async hydrate() {
      try {
        const saved =
          await secureReadJson<AccountIndex>(
            ACCOUNT_INDEX_KEY,
          );

        if (!saved) {
          set({
            hydrated: true,
          });

          return;
        }

        const accountExists = (
          accountId:
            | string
            | null
            | undefined,
        ) =>
          accountId != null &&
          saved.accounts.some(
            (account) =>
              account.id === accountId,
          );

        set({
          accounts: saved.accounts,
          activeAccountId:
            accountExists(
              saved.activeAccountId,
            )
              ? saved.activeAccountId
              : null,
          defaultAccountId:
            accountExists(
              saved.defaultAccountId,
            )
              ? saved.defaultAccountId ??
                null
              : null,
          hydrated: true,
        });
      } catch (error) {
        set({
          hydrated: true,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to load accounts.',
        });
      }
    },

    async createAccountFromLogin(name) {
      const cleanName = name.trim();

      if (!cleanName) {
        throw new Error(
          'Account name is required.',
        );
      }

      const accountId =
        Crypto.randomUUID();

      await claimLoginSession(accountId);

      const profileId =
        await adoptLoginIntoIsolatedProfile(
          accountId,
        );

      const now = Date.now();

      const account: Account = {
        id: accountId,
        name: cleanName,
        createdAt: now,
        updatedAt: now,
        status: 'ready',
        lastRefreshAt: now,
        ...(profileId
          ? { profileId }
          : {}),
      };

      const nextAccounts = [
        ...get().accounts,
        account,
      ];

      try {
        await saveIndex(
          nextAccounts,
          accountId,
          get().defaultAccountId,
        );
      } catch (error) {
        await deleteSessionSnapshot(
          accountId,
        );

        throw error;
      }

      set((state) => ({
        accounts: nextAccounts,
        activeAccountId: accountId,
        webViewEpoch:
          state.webViewEpoch + 1,
        error: null,
      }));

      return accountId;
    },

    async replaceAccountFromLogin(
      accountId,
    ) {
      await claimLoginSession(accountId);

      const profileId =
        await adoptLoginIntoIsolatedProfile(
          accountId,
          get().accounts.find(
            (account) =>
              account.id === accountId,
          )?.profileId,
        );

      const now = Date.now();

      const nextAccounts =
        get().accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                status: 'ready' as const,
                updatedAt: now,
                lastRefreshAt: now,
                ...(profileId
                  ? { profileId }
                  : {}),
              }
            : account,
        );

      await saveIndex(
        nextAccounts,
        accountId,
        get().defaultAccountId,
      );

      set((state) => ({
        accounts: nextAccounts,
        activeAccountId: accountId,
        webViewEpoch:
          state.webViewEpoch + 1,
        error: null,
      }));
    },

    async cancelLogin() {
      const accountId =
        get().activeAccountId;

      if (!accountId) {
        await abandonLoginSession();
        return 'home';
      }

      await get().switchAccount(
        accountId,
      );

      return 'messenger';
    },

    async switchAccount(accountId) {
      const target = get().accounts.find(
        (account) =>
          account.id === accountId,
      );

      if (!target) {
        throw new Error(
          'Account does not exist.',
        );
      }

      set({
        isSwitching: true,
        error: null,
      });

      try {
        const mode =
          await resolveSessionMode();

        let switchedProfileId:
          | string
          | undefined;

        if (mode === 'isolated') {
          // Isolated switch: no cookie wipe, no web
          // storage wipe. The target account's
          // profile keeps its own cookies, storage,
          // and cached chat history; the next WebView
          // simply binds to it.
          switchedProfileId =
            target.profileId ??
            newProfileId();

          await activateIsolatedSession(
            accountId,
            switchedProfileId,
          );
        } else {
          await switchGlobalSession(
            accountId,
          );
        }

        const nextAccounts =
          get().accounts.map((account) =>
            account.id === accountId
              ? {
                  ...account,
                  status: 'ready' as const,
                  updatedAt: Date.now(),
                  ...(switchedProfileId
                    ? {
                        profileId:
                          switchedProfileId,
                      }
                    : {}),
                }
              : account,
          );

        set((state) => ({
          accounts: nextAccounts,
          activeAccountId: accountId,
          webViewEpoch:
            state.webViewEpoch + 1,
        }));

        await saveIndex(
          nextAccounts,
          accountId,
          get().defaultAccountId,
        );
      } catch (error) {
        if (
          error instanceof SessionExpiredError
        ) {
          const nextAccounts =
            get().accounts.map((account) =>
              account.id === accountId
                ? {
                    ...account,
                    status:
                      'expired' as const,
                  }
                : account,
            );

          set({
            accounts: nextAccounts,
          });

          await saveIndex(
            nextAccounts,
            get().activeAccountId,
            get().defaultAccountId,
          );
        }

        throw error;
      } finally {
        set({
          isSwitching: false,
        });
      }
    },

    async persistActiveSession() {
      const accountId =
        get().activeAccountId;

      if (!accountId) {
        return 'no-active';
      }

      const activeProfileId =
        get().accounts.find(
          (account) =>
            account.id === accountId,
        )?.profileId;

      let result: SessionRefreshResult;

      if (
        activeProfileId &&
        (await resolveSessionMode()) ===
          'isolated'
      ) {
        // The profile itself is the durable store in
        // isolated mode; nothing to snapshot. Just
        // verify the session is still authenticated.
        result =
          (await isIsolatedSessionAuthenticated(
            activeProfileId,
          ))
            ? 'saved'
            : 'unauthenticated';
      } else {
        result = await persistOwnedSession(
          accountId,
        );
      }

      if (result === 'saved') {
        const nextAccounts =
          get().accounts.map((account) =>
            account.id === accountId
              ? {
                  ...account,
                  lastRefreshAt:
                    Date.now(),
                }
              : account,
          );

        set({
          accounts: nextAccounts,
        });

        await saveIndex(
          nextAccounts,
          get().activeAccountId,
          get().defaultAccountId,
        );
      }

      if (
        result === 'unauthenticated'
      ) {
        await get().markExpired(
          accountId,
        );
      }

      return result;
    },

    async markExpired(accountId) {
      const nextAccounts =
        get().accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                status:
                  'expired' as const,
              }
            : account,
        );

      set({
        accounts: nextAccounts,
      });

      await saveIndex(
        nextAccounts,
        get().activeAccountId,
        get().defaultAccountId,
      );
    },

    async renameAccount(
      accountId,
      name,
    ) {
      const cleanName = name.trim();

      if (!cleanName) {
        throw new Error(
          'Account name is required.',
        );
      }

      const nextAccounts =
        get().accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                name: cleanName,
                updatedAt: Date.now(),
              }
            : account,
        );

      await saveIndex(
        nextAccounts,
        get().activeAccountId,
        get().defaultAccountId,
      );

      set({
        accounts: nextAccounts,
      });
    },

    async moveAccount(
      accountId,
      direction,
    ) {
      const accounts = [
        ...get().accounts,
      ];

      const index = accounts.findIndex(
        (account) =>
          account.id === accountId,
      );

      const targetIndex =
        direction === 'up'
          ? index - 1
          : index + 1;

      if (
        index < 0 ||
        targetIndex < 0 ||
        targetIndex >= accounts.length
      ) {
        return;
      }

      const moved = accounts[index];
      accounts[index] =
        accounts[targetIndex];
      accounts[targetIndex] = moved;

      await saveIndex(
        accounts,
        get().activeAccountId,
        get().defaultAccountId,
      );

      set({
        accounts,
      });
    },

    async setDefaultAccount(accountId) {
      if (
        accountId !== null &&
        !get().accounts.some(
          (account) =>
            account.id === accountId,
        )
      ) {
        throw new Error(
          'Account does not exist.',
        );
      }

      await saveIndex(
        get().accounts,
        get().activeAccountId,
        accountId,
      );

      set({
        defaultAccountId: accountId,
      });
    },

    async forceClearCookies() {
      await forceClearGlobalSession();

      // In isolated mode each account also holds its
      // own profile jar; a panic clear must empty
      // those too. Vault snapshots survive, so a
      // later switch restores sessions exactly like
      // legacy.
      if (
        (await resolveSessionMode()) ===
        'isolated'
      ) {
        for (const account of get()
          .accounts) {
          if (account.profileId) {
            await deleteAccountProfile(
              account.profileId,
            );
          }
        }
      }

      set((state) => ({
        activeAccountId: null,
        webViewEpoch:
          state.webViewEpoch + 1,
      }));

      await saveIndex(
        get().accounts,
        null,
        get().defaultAccountId,
      );
    },

    async removeAccount(accountId) {
      const removedProfileId =
        get().accounts.find(
          (account) =>
            account.id === accountId,
        )?.profileId;

      const remaining =
        get().accounts.filter(
          (account) =>
            account.id !== accountId,
        );

      let nextActive =
        get().activeAccountId;

      if (nextActive === accountId) {
        nextActive = null;
      }

      let nextDefault =
        get().defaultAccountId;

      if (nextDefault === accountId) {
        nextDefault = null;
      }

      await releaseOwnedSession(
        accountId,
      );

      await deleteSessionSnapshot(
        accountId,
      );

      if (removedProfileId) {
        // Best-effort: clears the profile's cookies
        // and deletes it when no WebView holds it.
        await deleteAccountProfile(
          removedProfileId,
        );
      }

      await saveIndex(
        remaining,
        nextActive,
        nextDefault,
      );

      set({
        accounts: remaining,
        activeAccountId: nextActive,
        defaultAccountId: nextDefault,
      });
    },
  }));
