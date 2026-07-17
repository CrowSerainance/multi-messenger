import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import type {
  Account,
  AccountIndex,
} from '../types/session';

import {
  claimLoginSession,
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

const ACCOUNT_INDEX_KEY =
  'messenger.accounts.index.v1';

interface AccountStore {
  accounts: Account[];
  activeAccountId: string | null;
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

  switchAccount(
    accountId: string,
  ): Promise<void>;

  persistActiveSession():
  Promise<void>;

  markExpired(
    accountId: string,
  ): Promise<void>;

  removeAccount(
    accountId: string,
  ): Promise<void>;
}

async function saveIndex(
  accounts: Account[],
  activeAccountId: string | null,
): Promise<void> {
  const index: AccountIndex = {
    accounts,
    activeAccountId,
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

        const activeExists =
          saved.activeAccountId === null ||
          saved.accounts.some(
            (account) =>
              account.id ===
              saved.activeAccountId,
          );

        set({
          accounts: saved.accounts,
          activeAccountId:
            activeExists
              ? saved.activeAccountId
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

      const now = Date.now();

      const account: Account = {
        id: accountId,
        name: cleanName,
        createdAt: now,
        updatedAt: now,
        status: 'ready',
      };

      const nextAccounts = [
        ...get().accounts,
        account,
      ];

      try {
        await saveIndex(
          nextAccounts,
          accountId,
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

      const nextAccounts =
        get().accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                status: 'ready' as const,
                updatedAt: Date.now(),
              }
            : account,
        );

      await saveIndex(
        nextAccounts,
        accountId,
      );

      set((state) => ({
        accounts: nextAccounts,
        activeAccountId: accountId,
        webViewEpoch:
          state.webViewEpoch + 1,
        error: null,
      }));
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
        await switchGlobalSession(
          accountId,
        );

        const nextAccounts =
          get().accounts.map((account) =>
            account.id === accountId
              ? {
                  ...account,
                  status: 'ready' as const,
                  updatedAt: Date.now(),
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
        return;
      }

      const result =
        await persistOwnedSession(
          accountId,
        );

      if (
        result === 'unauthenticated'
      ) {
        await get().markExpired(
          accountId,
        );
      }
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
      );
    },

    async removeAccount(accountId) {
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

      await releaseOwnedSession(
        accountId,
      );

      await deleteSessionSnapshot(
        accountId,
      );

      await saveIndex(
        remaining,
        nextActive,
      );

      set({
        accounts: remaining,
        activeAccountId: nextActive,
      });
    },
  }));
