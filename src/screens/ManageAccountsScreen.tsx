import React, {
  useState,
} from 'react';

import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import type {
  Account,
} from '../types/session';

import {
  useAccountStore,
  type SessionRefreshResult,
} from '../store/accountStore';

import {
  NameAccountModal,
} from '../components/NameAccountModal';

import {
  AppBadge,
} from '../ui/AppBadge';

import {
  AppButton,
} from '../ui/AppButton';

import {
  EmptyState,
} from '../ui/EmptyState';

import {
  ScreenHeader,
} from '../ui/ScreenHeader';

import {
  colors,
  radius,
  space,
} from '../ui/theme';

interface Props {
  onBack(): void;
  onOpenSecurity(): void;
  onOpenPrivacy(): void;
}

function formatRefreshTime(
  timestamp: number | undefined,
): string {
  if (timestamp === undefined) {
    return 'Never';
  }

  return new Date(
    timestamp,
  ).toLocaleString();
}

function refreshResultMessage(
  result: SessionRefreshResult,
): string {
  switch (result) {
    case 'saved':
      return 'The active session was refreshed and saved.';
    case 'unauthenticated':
      return 'The active account is signed out. It has been marked as requiring sign-in.';
    case 'not-owner':
      return 'No active account currently owns the cookie jar, so nothing was saved.';
    case 'no-active':
      return 'There is no active account to refresh.';
  }
}

export function ManageAccountsScreen({
  onBack,
  onOpenSecurity,
  onOpenPrivacy,
}: Props) {
  const insets = useSafeAreaInsets();

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

  const defaultAccountId =
    useAccountStore(
      (state) =>
        state.defaultAccountId,
    );

  const renameAccount =
    useAccountStore(
      (state) =>
        state.renameAccount,
    );

  const moveAccount =
    useAccountStore(
      (state) =>
        state.moveAccount,
    );

  const setDefaultAccount =
    useAccountStore(
      (state) =>
        state.setDefaultAccount,
    );

  const removeAccount =
    useAccountStore(
      (state) =>
        state.removeAccount,
    );

  const persistActiveSession =
    useAccountStore(
      (state) =>
        state.persistActiveSession,
    );

  const forceClearCookies =
    useAccountStore(
      (state) =>
        state.forceClearCookies,
    );

  const [working, setWorking] =
    useState(false);

  const [
    renameTarget,
    setRenameTarget,
  ] = useState<Account | null>(null);

  const run = async (
    action: () => Promise<void>,
  ) => {
    if (working) {
      return;
    }

    setWorking(true);

    try {
      await action();
    } catch (error) {
      Alert.alert(
        'Action failed',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );
    } finally {
      setWorking(false);
    }
  };

  const submitRename = (
    name: string,
  ) => {
    const target = renameTarget;

    if (!target) {
      return;
    }

    void run(async () => {
      await renameAccount(
        target.id,
        name,
      );

      setRenameTarget(null);
    });
  };

  const toggleDefault = (
    account: Account,
  ) => {
    void run(async () => {
      await setDefaultAccount(
        account.id === defaultAccountId
          ? null
          : account.id,
      );
    });
  };

  const confirmRemove = (
    account: Account,
  ) => {
    Alert.alert(
      'Remove account',
      `Remove "${account.name}" and its saved session? This cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void run(() =>
              removeAccount(account.id),
            );
          },
        },
      ],
    );
  };

  const refreshActiveSession = () => {
    void run(async () => {
      const result =
        await persistActiveSession();

      Alert.alert(
        'Refresh Session',
        refreshResultMessage(result),
      );
    });
  };

  const confirmForceClear = () => {
    Alert.alert(
      'Force Clear Cookies',
      'This clears every cookie in the shared WebView jar. Saved account snapshots are kept, but you will return to the account list.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void run(async () => {
              await forceClearCookies();

              Alert.alert(
                'Cookies cleared',
                'The shared cookie jar is now empty.',
              );
            });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Manage Accounts"
        onBack={onBack}
      />

      <FlatList
        data={accounts}
        keyExtractor={(item) =>
          item.id
        }
        contentContainerStyle={[
          styles.list,
          {
            paddingBottom:
              Math.max(
                insets.bottom,
                space.sm,
              ) + space.lg,
          },
        ]}
        ListEmptyComponent={
          <EmptyState
            title="Nothing to manage"
            body="Add an account from the home screen first."
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.sectionLabel}>
              Session tools
            </Text>

            <AppButton
              title="Refresh Active Session"
              disabled={
                working ||
                activeAccountId === null
              }
              busy={working}
              onPress={refreshActiveSession}
              variant="secondary"
            />

            <AppButton
              title="Force Clear Cookies"
              disabled={working}
              onPress={confirmForceClear}
              variant="dangerGhost"
            />

            <Text style={styles.sectionLabel}>
              App settings
            </Text>

            <View style={styles.footerRow}>
              <AppButton
                title="Security"
                disabled={working}
                onPress={onOpenSecurity}
                variant="secondary"
                style={styles.footerHalf}
              />

              <AppButton
                title="Privacy"
                disabled={working}
                onPress={onOpenPrivacy}
                variant="secondary"
                style={styles.footerHalf}
              />
            </View>
          </View>
        }
        renderItem={({
          item,
          index,
        }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>
                {item.name}
              </Text>

              <View style={styles.badges}>
                {item.id ===
                  defaultAccountId && (
                  <AppBadge
                    label="Default"
                    tone="success"
                  />
                )}

                {item.id ===
                  activeAccountId && (
                  <AppBadge
                    label="Active"
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
              </View>
            </View>

            <Text style={styles.detail}>
              Last refresh:{' '}
              {formatRefreshTime(
                item.lastRefreshAt,
              )}
            </Text>

            <View style={styles.actions}>
              <AppButton
                title="Up"
                size="sm"
                variant="secondary"
                disabled={
                  working || index === 0
                }
                onPress={() => {
                  void run(() =>
                    moveAccount(
                      item.id,
                      'up',
                    ),
                  );
                }}
                style={styles.action}
              />

              <AppButton
                title="Down"
                size="sm"
                variant="secondary"
                disabled={
                  working ||
                  index ===
                    accounts.length - 1
                }
                onPress={() => {
                  void run(() =>
                    moveAccount(
                      item.id,
                      'down',
                    ),
                  );
                }}
                style={styles.action}
              />

              <AppButton
                title="Rename"
                size="sm"
                variant="secondary"
                disabled={working}
                onPress={() =>
                  setRenameTarget(item)
                }
                style={styles.action}
              />

              <AppButton
                title={
                  item.id ===
                  defaultAccountId
                    ? 'Unset Default'
                    : 'Set Default'
                }
                size="sm"
                variant="secondary"
                disabled={working}
                onPress={() =>
                  toggleDefault(item)
                }
                style={styles.action}
              />

              <AppButton
                title="Remove"
                size="sm"
                variant="dangerGhost"
                disabled={working}
                onPress={() =>
                  confirmRemove(item)
                }
                style={styles.action}
              />
            </View>
          </View>
        )}
      />

      <NameAccountModal
        visible={renameTarget !== null}
        busy={working}
        title="Rename account"
        submitLabel="Save Name"
        initialName={
          renameTarget?.name ?? ''
        }
        onSubmit={submitRename}
        onCancel={() =>
          setRenameTarget(null)
        }
      />
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    list: {
      flexGrow: 1,
      padding: space.lg,
      gap: space.md,
    },

    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.sm,
    },

    cardHeader: {
      gap: space.sm,
    },

    name: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },

    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },

    detail: {
      color: colors.textMuted,
      fontSize: 14,
    },

    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: space.sm,
    },

    action: {
      flexGrow: 1,
    },

    footer: {
      marginTop: space.lg,
      gap: space.sm,
      paddingTop: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    sectionLabel: {
      marginTop: space.sm,
      marginBottom: space.xs,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    footerRow: {
      flexDirection: 'row',
      gap: space.sm,
    },

    footerHalf: {
      flex: 1,
    },
  });
