import React, {
  useState,
} from 'react';

import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
      <View style={styles.toolbar}>
        <Button
          title="Back"
          onPress={onBack}
          disabled={working}
        />

        <Text style={styles.title}>
          Manage Accounts
        </Text>
      </View>

      <FlatList
        data={accounts}
        keyExtractor={(item) =>
          item.id
        }
        contentContainerStyle={
          styles.list
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No saved accounts.
          </Text>
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
                  <Text style={styles.defaultBadge}>
                    Default
                  </Text>
                )}

                {item.id ===
                  activeAccountId && (
                  <Text style={styles.activeBadge}>
                    Active
                  </Text>
                )}
              </View>
            </View>

            {item.status ===
              'expired' && (
              <Text style={styles.expired}>
                Sign-in required
              </Text>
            )}

            <Text style={styles.detail}>
              Last session refresh:{' '}
              {formatRefreshTime(
                item.lastRefreshAt,
              )}
            </Text>

            <View style={styles.actions}>
              <Button
                title="↑"
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
              />

              <Button
                title="↓"
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
              />

              <Button
                title="Rename"
                disabled={working}
                onPress={() =>
                  setRenameTarget(item)
                }
              />

              <Button
                title={
                  item.id ===
                  defaultAccountId
                    ? 'Unset Default'
                    : 'Set Default'
                }
                disabled={working}
                onPress={() =>
                  toggleDefault(item)
                }
              />

              <Button
                title="Remove"
                color="#b00020"
                disabled={working}
                onPress={() =>
                  confirmRemove(item)
                }
              />
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <Button
          title="Refresh Active Session"
          disabled={
            working ||
            activeAccountId === null
          }
          onPress={refreshActiveSession}
        />

        <Button
          title="Force Clear Cookies"
          color="#b00020"
          disabled={working}
          onPress={confirmForceClear}
        />

        <Button
          title="Security"
          disabled={working}
          onPress={onOpenSecurity}
        />

        <Button
          title="Privacy"
          disabled={working}
          onPress={onOpenPrivacy}
        />
      </View>

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
      paddingTop: 40,
      backgroundColor: 'white',
    },

    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    title: {
      fontSize: 20,
      fontWeight: '800',
    },

    list: {
      flexGrow: 1,
      padding: 12,
      gap: 12,
    },

    empty: {
      color: '#777',
      textAlign: 'center',
      marginTop: 32,
    },

    card: {
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 12,
      padding: 14,
      gap: 6,
    },

    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 8,
    },

    name: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
    },

    badges: {
      flexDirection: 'row',
      gap: 6,
    },

    defaultBadge: {
      color: '#1a6b1a',
      fontWeight: '700',
    },

    activeBadge: {
      color: '#1a4b8b',
      fontWeight: '700',
    },

    expired: {
      color: '#b00020',
    },

    detail: {
      color: '#555',
    },

    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },

    footer: {
      padding: 12,
      gap: 8,
    },
  });
