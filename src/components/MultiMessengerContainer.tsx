import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  MessengerWebView,
} from './MessengerWebView';

import {
  useLiveSessionStore,
} from '../services/liveSessionManager';

import {
  resetNextWebViewProfile,
  setNextWebViewProfile,
} from '../services/profileBackend';

import {
  acquireWebViewCreation,
} from '../services/webViewAdmission';

import {
  useAccountStore,
} from '../store/accountStore';

import {
  space,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

/**
 * Multi-live WebView container (ML-3).
 *
 * Owns one mounted WebView per warm account, each bound to that
 * account's isolated native profile. Switching accounts changes
 * which layer is visible — nothing is unmounted, reloaded, or
 * cookie-swapped, so chat history and scroll position survive.
 *
 * Mounting is strictly serial. The patched react-native-webview
 * reads a single process-global pending-profile slot at creation
 * time, so exactly one WebView may be created at a time and the
 * slot is only handed on once that instance exists.
 */

interface MountedSlot {
  accountId: string;
  profileId: string;
  generation: number;
}

interface Props {
  onReauthenticate(accountId: string): void;
}

// If a WebView never reports its native instance, the admission
// slot must not be held forever.
const ADMISSION_WATCHDOG_MS = 12_000;

export function MultiMessengerContainer({
  onReauthenticate,
}: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const entries =
    useLiveSessionStore(
      (state) => state.entries,
    );

  const markReady =
    useLiveSessionStore(
      (state) => state.markReady,
    );

  const activeAccountId =
    useAccountStore(
      (state) => state.activeAccountId,
    );

  const epoch =
    useAccountStore(
      (state) => state.webViewEpoch,
    );

  const markExpired =
    useAccountStore(
      (state) => state.markExpired,
    );

  const [mounted, setMounted] =
    useState<MountedSlot[]>([]);

  // Mount key currently being admitted, or null. Kept in state so
  // finishing an admission re-runs the reconcile effect.
  const [admitting, setAdmitting] =
    useState<string | null>(null);

  const releaseRef =
    useRef<(() => void) | null>(null);

  const watchdogRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const finishAdmission =
    useCallback(() => {
      if (watchdogRef.current !== null) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }

      const release = releaseRef.current;
      releaseRef.current = null;
      release?.();

      setAdmitting(null);
    }, []);

  // Drop WebViews whose account left the warm set, or whose
  // generation was recycled (reauthentication).
  useEffect(() => {
    setMounted((previous) => {
      const kept = previous.filter((slot) =>
        entries.some(
          (entry) =>
            entry.accountId === slot.accountId &&
            entry.generation === slot.generation,
        ),
      );

      return kept.length === previous.length
        ? previous
        : kept;
    });
  }, [entries]);

  // Admit the next requested session, one at a time.
  useEffect(() => {
    if (admitting !== null) {
      return;
    }

    const next = entries.find(
      (entry) =>
        !mounted.some(
          (slot) =>
            slot.accountId === entry.accountId &&
            slot.generation === entry.generation,
        ),
    );

    if (!next) {
      return;
    }

    const key = `${next.accountId}:${next.generation}`;

    let cancelled = false;

    setAdmitting(key);

    void (async () => {
      let release: (() => void) | null = null;

      try {
        release = await acquireWebViewCreation(
          `live:${next.accountId}`,
        );

        if (cancelled) {
          release();
          setAdmitting(null);
          return;
        }

        releaseRef.current = release;

        // Must be awaited before the WebView mounts: the
        // native factory reads this at creation time.
        await setNextWebViewProfile(
          next.profileId,
        );

        watchdogRef.current = setTimeout(() => {
          finishAdmission();
        }, ADMISSION_WATCHDOG_MS);

        setMounted((previous) => [
          ...previous.filter(
            (slot) =>
              slot.accountId !== next.accountId,
          ),
          {
            accountId: next.accountId,
            profileId: next.profileId,
            generation: next.generation,
          },
        ]);
      } catch (error) {
        if (__DEV__) {
          console.log(
            'LIVE_ADMISSION_FAILED',
            error instanceof Error
              ? error.message
              : String(error),
          );
        }

        releaseRef.current = null;
        release?.();
        setAdmitting(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    admitting,
    entries,
    finishAdmission,
    mounted,
  ]);

  useEffect(
    () => () => {
      if (watchdogRef.current !== null) {
        clearTimeout(watchdogRef.current);
      }

      releaseRef.current?.();
      releaseRef.current = null;
    },
    [],
  );

  const handleNativeCreated =
    useCallback(() => {
      void (async () => {
        try {
          // Leave the global slot on the default profile so a
          // WebView created outside this container can never
          // inherit an account's profile by accident.
          await resetNextWebViewProfile();
        } catch {
          // Non-fatal: the next admission sets the slot again
          // before it mounts anything.
        }

        finishAdmission();
      })();
    }, [finishAdmission]);

  const handleExpired = useCallback(
    (accountId: string) => {
      void markExpired(accountId).finally(() => {
        onReauthenticate(accountId);
      });
    },
    [markExpired, onReauthenticate],
  );

  const activeIsMounted =
    activeAccountId !== null &&
    mounted.some(
      (slot) =>
        slot.accountId === activeAccountId,
    );

  return (
    <View style={styles.container}>
      {mounted.map((slot) => {
        const isActive =
          slot.accountId === activeAccountId;

        return (
          <View
            key={`${slot.accountId}:${slot.generation}`}
            // Hidden sessions keep their full size: a
            // zero-sized layout would change Messenger's
            // responsive state and force a re-layout on
            // every switch.
            style={[
              styles.layer,
              isActive
                ? styles.layerActive
                : styles.layerHidden,
            ]}
            pointerEvents={
              isActive ? 'auto' : 'none'
            }
            collapsable={false}
          >
            <MessengerWebView
              accountId={slot.accountId}
              epoch={epoch}
              isActive={isActive}
              onNativeCreated={
                handleNativeCreated
              }
              onReady={() =>
                markReady(slot.accountId)
              }
              onExpired={() =>
                handleExpired(slot.accountId)
              }
            />
          </View>
        );
      })}

      {!activeIsMounted && (
        <View style={styles.pending}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text style={styles.pendingText}>
            Opening session…
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  layer: {
    ...StyleSheet.absoluteFill,
  },

  layerActive: {
    opacity: 1,
    zIndex: 1,
  },

  layerHidden: {
    opacity: 0,
    zIndex: 0,
  },

  pending: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: colors.background,
  },

  pendingText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
