import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import type {
  Account,
  AccountIndex,
} from '../types/session';

import {
  abandonLoginSession,
  beginFreshLoginSession,
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
  resetNextWebViewProfile,
} from '../services/profileBackend';

import {
  activateIsolatedSession,
  claimIsolatedLoginSession,
  deleteAccountProfile,
  persistIsolatedSession,
  prepareIsolatedLogin,
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
  /**
   * Profile the in-flight login WebView is bound to.
   * Cleared on successful claim or cancel.
   */
  pendingLoginProfileId: string | null;

  hydrate(): Promise<void>;

  /**
   * Isolated mode: allocate/clear the destination
   * profile and bind the next WebView to it before
   * LoginScreen mounts. Returns the profile id.
   * Legacy mode: runs beginFreshLoginSession.
   */
  prepareLogin(
    reauthAccountId?: string,
  ): Promise<string | null>;

  createAccountFromLogin(
    name: string,
    profileId?: string,
  ): Promise<string>;

  replaceAccountFromLogin(
    accountId: string,
    profileId?: string,
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
    pendingLoginProfileId: null,

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

    async prepareLogin(reauthAccountId) {
      if (
        (await resolveSessionMode()) !==
        'isolated'
      ) {
        await beginFreshLoginSession();
        set({ pendingLoginProfileId: null });
        return null;
      }

      const existingProfileId =
        reauthAccountId
          ? get().accounts.find(
              (account) =>
                account.id ===
                reauthAccountId,
            )?.profileId
          : undefined;

      const profileId =
        existingProfileId ?? newProfileId();

      await prepareIsolatedLogin(profileId);

      set({
        pendingLoginProfileId: profileId,
      });

      return profileId;
    },

    async createAccountFromLogin(
      name,
      profileId,
    ) {
      const cleanName = name.trim();

      if (!cleanName) {
        throw new Error(
          'Account name is required.',
        );
      }

      const accountId =
        Crypto.randomUUID();

      const mode =
        await resolveSessionMode();

      let resolvedProfileId =
        profileId ??
        get().pendingLoginProfileId ??
        undefined;

      if (mode === 'isolated') {
        if (!resolvedProfileId) {
          throw new Error(
            'Login profile was not prepared.',
          );
        }

        await claimIsolatedLoginSession(
          accountId,
          resolvedProfileId,
        );
      } else {
        await claimLoginSession(accountId);
        resolvedProfileId = undefined;
      }

      const now = Date.now();

      const account: Account = {
        id: accountId,
        name: cleanName,
        createdAt: now,
        updatedAt: now,
        status: 'ready',
        lastRefreshAt: now,
        ...(resolvedProfileId
          ? {
              profileId: resolvedProfileId,
              profileCookiesV2: true,
            }
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
        pendingLoginProfileId: null,
        webViewEpoch:
          state.webViewEpoch + 1,
        error: null,
      }));

      return accountId;
    },

    async replaceAccountFromLogin(
      accountId,
      profileId,
    ) {
      const mode =
        await resolveSessionMode();

      let resolvedProfileId =
        profileId ??
        get().pendingLoginProfileId ??
        get().accounts.find(
          (account) =>
            account.id === accountId,
        )?.profileId;

      if (mode === 'isolated') {
        if (!resolvedProfileId) {
          resolvedProfileId =
            newProfileId();
        }

        await claimIsolatedLoginSession(
          accountId,
          resolvedProfileId,
        );
      } else {
        await claimLoginSession(accountId);
        resolvedProfileId = undefined;
      }

      const now = Date.now();

      const nextAccounts =
        get().accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                status: 'ready' as const,
                updatedAt: now,
                lastRefreshAt: now,
                ...(resolvedProfileId
                  ? {
                      profileId:
                        resolvedProfileId,
                      profileCookiesV2: true,
                    }
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
        pendingLoginProfileId: null,
        webViewEpoch:
          state.webViewEpoch + 1,
        error: null,
      }));
    },

    async cancelLogin() {
      const pendingProfileId =
        get().pendingLoginProfileId;

      const previousAccountId =
        get().activeAccountId;

      if (
        pendingProfileId &&
        (await resolveSessionMode()) ===
          'isolated'
      ) {
        const ownedAccount =
          get().accounts.find(
            (account) =>
              account.profileId ===
              pendingProfileId,
          );

        if (!ownedAccount) {
          // Brand-new login cancelled: drop the
          // temporary profile so it cannot linger.
          await deleteAccountProfile(
            pendingProfileId,
          );
        } else {
          // Reauth cancelled after the profile was
          // wiped for login: restore vault cookies.
          try {
            await activateIsolatedSession(
              ownedAccount.id,
              pendingProfileId,
            );
          } catch {
            // Leave the account marked for reauth
            // by the switch path below if needed.
          }
        }
      }

      set({ pendingLoginProfileId: null });

      if (!previousAccountId) {
        await abandonLoginSession();
        await resetNextWebViewProfile();
        return 'home';
      }

      await get().switchAccount(
        previousAccountId,
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
            {
              // One-time rewrite of host-only cookie
              // copies from the first ML-1 migration.
              forceRemigrate:
                !target.profileCookiesV2,
            },
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
                        profileCookiesV2: true,
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
        result = await persistIsolatedSession(
          accountId,
          activeProfileId,
        );
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
