import React, {
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  MessengerWebView,
} from '../components/MessengerWebView';

import {
  MultiMessengerContainer,
} from '../components/MultiMessengerContainer';

import {
  MAX_LIVE_SESSIONS,
} from '../constants/features';

import {
  useLiveSessionStore,
} from '../services/liveSessionManager';

import type {
  LiveSessionState,
} from '../types/liveSession';

import {
  useAccountStore,
} from '../store/accountStore';

import {
  AppBadge,
} from '../ui/AppBadge';

import {
  AppButton,
} from '../ui/AppButton';

import {
  ScreenHeader,
} from '../ui/ScreenHeader';

import {
  radius,
  space,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

interface Props {
  /**
   * True when isolated profiles + multi-live are active. Sessions
   * are then kept warm by MultiMessengerContainer and switching is
   * visibility-only; false keeps the legacy single, remounting
   * WebView.
   */
  multiLive: boolean;
  onAddAccount(): void;
  onReauthenticate(
    accountId: string,
  ): void;
  onBackToAccounts(): void;
  onOpenDiagnostics(): void;
}

export function MessengerScreen({
  multiLive,
  onAddAccount,
  onReauthenticate,
  onBackToAccounts,
  onOpenDiagnostics,
}: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();

  const [
    switcherVisible,
    setSwitcherVisible,
  ] = useState(false);

  const accounts =
    useAccountStore(
      (state) =>
        state.accounts,
    );

  const activeAccountId =
    useAccountStore(
      (state) =>
        state.activeAccountId,
    );

  const isSwitching =
    useAccountStore(
      (state) =>
        state.isSwitching,
    );

  const epoch =
    useAccountStore(
      (state) =>
        state.webViewEpoch,
    );

  const switchAccount =
    useAccountStore(
      (state) =>
        state.switchAccount,
    );

  const markExpired =
    useAccountStore(
      (state) =>
        state.markExpired,
    );

  const liveEntries =
    useLiveSessionStore(
      (state) => state.entries,
    );

  const liveStateOf = (
    accountId: string,
    status: string,
  ): LiveSessionState => {
    if (status === 'expired') {
      return 'expired';
    }

    const entry = liveEntries.find(
      (candidate) =>
        candidate.accountId === accountId,
    );

    if (!entry) {
      return 'hibernated';
    }

    return entry.ready
      ? 'live'
      : 'loading';
  };

  const activeAccount =
    accounts.find(
      (account) =>
        account.id ===
        activeAccountId,
    );

  if (
    !activeAccountId ||
    !activeAccount
  ) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>
          No active account
        </Text>

        <Text style={styles.emptyBody}>
          Choose an account from your list
          to continue.
        </Text>

        <AppButton
          title="Go to Accounts"
          onPress={
            onBackToAccounts
          }
        />
      </View>
    );
  }

  const selectAccount =
    async (accountId: string) => {
      setSwitcherVisible(false);

      const target =
        accounts.find(
          (account) =>
            account.id ===
            accountId,
        );

      if (
        target?.status ===
        'expired'
      ) {
        onReauthenticate(
          accountId,
        );

        return;
      }

      if (
        accountId === activeAccountId
      ) {
        return;
      }

      try {
        await switchAccount(
          accountId,
        );
      } catch {
        onReauthenticate(
          accountId,
        );
      }
    };

  const handleExpired =
    async () => {
      await markExpired(
        activeAccountId,
      );

      onReauthenticate(
        activeAccountId,
      );
    };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={activeAccount.name}
        subtitle="Messenger"
        onBack={() =>
          setSwitcherVisible(true)
        }
        backLabel="Switch"
        right={
          <AppButton
            title="Add"
            onPress={onAddAccount}
            variant="ghost"
            size="sm"
          />
        }
      />

      {/*
        The app draws edge-to-edge, so without this inset the page's
        own composer sits underneath the system navigation bar. Both
        session paths share the host so warm and legacy WebViews get
        exactly the same height.
      */}
      <View
        style={[
          styles.webViewHost,
          {
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {multiLive ? (
          <MultiMessengerContainer
            onReauthenticate={
              onReauthenticate
            }
          />
        ) : (
          <MessengerWebView
            accountId={
              activeAccountId
            }
            epoch={epoch}
            onExpired={() => {
              void handleExpired();
            }}
          />
        )}
      </View>

      {isSwitching && (
        <View style={styles.overlay}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text style={styles.overlayText}>
            Switching account…
          </Text>
        </View>
      )}

      <Modal
        transparent
        animationType="slide"
        visible={
          switcherVisible
        }
        onRequestClose={() =>
          setSwitcherVisible(
            false,
          )
        }
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() =>
            setSwitcherVisible(false)
          }
        >
          <Pressable
            style={[
              styles.sheet,
              {
                paddingBottom:
                  Math.max(
                    insets.bottom,
                    space.lg,
                  ),
              },
            ]}
            onPress={() => undefined}
          >
            <View style={styles.handle} />

            <Text style={styles.sheetTitle}>
              Switch Account
            </Text>

            <Text style={styles.sheetHint}>
              {multiLive
                ? `Up to ${MAX_LIVE_SESSIONS} accounts stay signed in and loaded, so switching is instant.`
                : 'Only one Messenger session is active at a time.'}
            </Text>

            <FlatList
              data={accounts}
              keyExtractor={(item) =>
                item.id
              }
              style={styles.sheetList}
              renderItem={({
                item,
              }) => {
                const isCurrent =
                  item.id ===
                  activeAccountId;

                return (
                  <Pressable
                    style={({
                      pressed,
                    }) => [
                      styles.accountRow,
                      isCurrent
                        ? styles.accountRowCurrent
                        : null,
                      pressed
                        ? styles.accountRowPressed
                        : null,
                    ]}
                    onPress={() => {
                      void selectAccount(
                        item.id,
                      );
                    }}
                  >
                    <View style={styles.rowBody}>
                      <Text
                        style={
                          styles.rowName
                        }
                      >
                        {item.name}
                      </Text>

                      <View style={styles.rowBadges}>
                        {isCurrent && (
                          <AppBadge
                            label="Current"
                            tone="primary"
                          />
                        )}

                        {item.status ===
                          'expired' && (
                          <AppBadge
                            label="Sign-in needed"
                            tone="danger"
                          />
                        )}

                        {multiLive &&
                          item.status !==
                            'expired' &&
                          (() => {
                            const state =
                              liveStateOf(
                                item.id,
                                item.status,
                              );

                            if (
                              state === 'live'
                            ) {
                              return (
                                <AppBadge
                                  label="Live"
                                  tone="success"
                                />
                              );
                            }

                            if (
                              state === 'loading'
                            ) {
                              return (
                                <AppBadge
                                  label="Loading"
                                  tone="warning"
                                />
                              );
                            }

                            return (
                              <AppBadge
                                label="Hibernated"
                                tone="neutral"
                              />
                            );
                          })()}
                      </View>
                    </View>

                    <Text style={styles.chevron}>
                      ›
                    </Text>
                  </Pressable>
                );
              }}
            />

            <AppButton
              title="Add Account"
              onPress={() => {
                setSwitcherVisible(
                  false,
                );

                onAddAccount();
              }}
            />

            <AppButton
              title="All Accounts"
              variant="secondary"
              onPress={() => {
                setSwitcherVisible(false);
                onBackToAccounts();
              }}
            />

            <AppButton
              title="Session Diagnostics"
              variant="ghost"
              onPress={() => {
                setSwitcherVisible(false);
                onOpenDiagnostics();
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
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

    webViewHost: {
      flex: 1,
      backgroundColor: colors.background,
    },

    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: space.md,
      padding: space.xl,
      backgroundColor: colors.background,
    },

    emptyTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },

    emptyBody: {
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: space.sm,
    },

    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        colors.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      gap: space.md,
    },

    overlayText: {
      color: colors.text,
      fontWeight: '600',
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },

    sheet: {
      backgroundColor: colors.surface,
      paddingHorizontal: space.xl,
      paddingTop: space.md,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      maxHeight: '78%',
      gap: space.md,
    },

    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.borderStrong,
      marginBottom: space.xs,
    },

    sheetTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
    },

    sheetHint: {
      color: colors.textMuted,
      marginTop: -4,
      marginBottom: space.xs,
    },

    sheetList: {
      maxHeight: 280,
    },

    accountRow: {
      paddingVertical: space.lg,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: space.md,
    },

    accountRowCurrent: {
      backgroundColor: colors.primarySoft,
    },

    accountRowPressed: {
      backgroundColor: colors.surfacePressed,
    },

    rowBody: {
      flex: 1,
      gap: space.sm,
    },

    rowName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },

    rowBadges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },

    chevron: {
      fontSize: 22,
      color: colors.textSubtle,
    },
  });
