import { create } from 'zustand';

import {
  MAX_LIVE_SESSIONS,
} from '../constants/features';

import type {
  LiveSessionEntry,
} from '../types/liveSession';

/**
 * Warm-session bookkeeping for multi-live mode (ML-3).
 *
 * Holds the desired warm set and its LRU order. The container
 * reconciles against it: entries here are a request to keep an
 * account mounted, `ready` records that its WebView answered.
 * Nothing in this module touches cookies, profiles, or React.
 */

interface LiveSessionStore {
  entries: LiveSessionEntry[];

  /**
   * Ask for an account to be warm and mark it most-recently used.
   * Evicts the LRU tail when the limit is exceeded; never evicts
   * the requested account or one flagged busy.
   */
  requestLive(
    accountId: string,
    profileId: string,
    options?: {
      /** Force a fresh WebView instead of reusing the warm one. */
      recycle?: boolean;
    },
  ): void;

  markReady(accountId: string): void;

  setBusy(
    accountId: string,
    busy: boolean,
  ): void;

  /** Drop one account from the warm set (its WebView unmounts). */
  release(accountId: string): void;

  releaseAll(): void;
}

function enforceLimit(
  entries: LiveSessionEntry[],
  protectedAccountId: string,
): LiveSessionEntry[] {
  if (entries.length <= MAX_LIVE_SESSIONS) {
    return entries;
  }

  const evictable = entries
    .filter(
      (entry) =>
        entry.accountId !== protectedAccountId &&
        !entry.busy,
    )
    .sort(
      (left, right) =>
        left.lastActiveAt - right.lastActiveAt,
    );

  const surplus =
    entries.length - MAX_LIVE_SESSIONS;

  const evicted = new Set(
    evictable
      .slice(0, surplus)
      .map((entry) => entry.accountId),
  );

  if (evicted.size === 0) {
    // Everything is either active or busy. Staying over the
    // limit is safer than dropping a live call or upload; the
    // next switch re-runs this check.
    return entries;
  }

  return entries.filter(
    (entry) => !evicted.has(entry.accountId),
  );
}

export const useLiveSessionStore =
  create<LiveSessionStore>((set) => ({
    entries: [],

    requestLive(accountId, profileId, options) {
      set((state) => {
        const now = Date.now();

        const existing = state.entries.find(
          (entry) =>
            entry.accountId === accountId,
        );

        // A profile change or an explicit recycle means the
        // warm WebView no longer represents this session.
        const stale =
          existing !== undefined &&
          (options?.recycle === true ||
            existing.profileId !== profileId);

        const next: LiveSessionEntry[] = existing
          ? state.entries.map((entry) =>
              entry.accountId === accountId
                ? {
                    ...entry,
                    profileId,
                    lastActiveAt: now,
                    generation: stale
                      ? entry.generation + 1
                      : entry.generation,
                    ready: stale
                      ? false
                      : entry.ready,
                  }
                : entry,
            )
          : [
              ...state.entries,
              {
                accountId,
                profileId,
                generation: 0,
                requestedAt: now,
                lastActiveAt: now,
                ready: false,
                busy: false,
              },
            ];

        return {
          entries: enforceLimit(
            next,
            accountId,
          ),
        };
      });
    },

    // markReady and setBusy are called from WebView callbacks that
    // can fire repeatedly. They must return the *same* entries
    // array when nothing changed: a fresh array on every call would
    // re-render the container, hand its children new callbacks, and
    // feed the next identical call straight back in.
    markReady(accountId) {
      set((state) => {
        const target = state.entries.find(
          (entry) =>
            entry.accountId === accountId,
        );

        if (!target || target.ready) {
          return state;
        }

        return {
          entries: state.entries.map((entry) =>
            entry.accountId === accountId
              ? { ...entry, ready: true }
              : entry,
          ),
        };
      });
    },

    setBusy(accountId, busy) {
      set((state) => {
        const target = state.entries.find(
          (entry) =>
            entry.accountId === accountId,
        );

        if (!target || target.busy === busy) {
          return state;
        }

        return {
          entries: state.entries.map((entry) =>
            entry.accountId === accountId
              ? { ...entry, busy }
              : entry,
          ),
        };
      });
    },

    release(accountId) {
      set((state) => ({
        entries: state.entries.filter(
          (entry) =>
            entry.accountId !== accountId,
        ),
      }));
    },

    releaseAll() {
      set({ entries: [] });
    },
  }));

/**
 * Non-reactive read for store actions and services. Components
 * should subscribe with a selector instead.
 */
export function isAccountLive(
  accountId: string,
): boolean {
  return useLiveSessionStore
    .getState()
    .entries.some(
      (entry) =>
        entry.accountId === accountId &&
        entry.ready,
    );
}

export function liveProfileIdOf(
  accountId: string,
): string | undefined {
  return useLiveSessionStore
    .getState()
    .entries.find(
      (entry) =>
        entry.accountId === accountId,
    )?.profileId;
}

/** Diagnostics: warm-set shape without any session content. */
export function describeLiveSessions(): {
  count: number;
  ready: number;
  max: number;
} {
  const { entries } =
    useLiveSessionStore.getState();

  return {
    count: entries.length,
    ready: entries.filter(
      (entry) => entry.ready,
    ).length,
    max: MAX_LIVE_SESSIONS,
  };
}
