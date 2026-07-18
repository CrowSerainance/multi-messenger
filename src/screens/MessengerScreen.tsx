import React, {
  useState,
} from 'react';

import {
  ActivityIndicator,
  Button,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  MessengerWebView,
} from '../components/MessengerWebView';

import {
  useAccountStore,
} from '../store/accountStore';

interface Props {
  onAddAccount(): void;
  onReauthenticate(
    accountId: string,
  ): void;
  onBackToAccounts(): void;
  onOpenDiagnostics(): void;
}

export function MessengerScreen({
  onAddAccount,
  onReauthenticate,
  onBackToAccounts,
  onOpenDiagnostics,
}: Props) {
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
        <Text>
          No active account.
        </Text>

        <Button
          title="Accounts"
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

      // Re-selecting the active account
      // would only remount the WebView and
      // lose the current chat position.
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
      <View style={styles.toolbar}>
        <Button
          title="Accounts"
          onPress={() =>
            setSwitcherVisible(true)
          }
        />

        <Text
          numberOfLines={1}
          style={styles.accountName}
        >
          {activeAccount.name}
        </Text>

        <Button
          title="+"
          onPress={onAddAccount}
        />

      </View>

      <MessengerWebView
        accountId={
          activeAccountId
        }
        epoch={epoch}
        onExpired={() => {
          void handleExpired();
        }}
      />

      {isSwitching && (
        <View style={styles.overlay}>
          <ActivityIndicator
            size="large"
          />

          <Text>
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
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              Switch Account
            </Text>

            <FlatList
              data={accounts}
              keyExtractor={(item) =>
                item.id
              }
              renderItem={({
                item,
              }) => (
                <Pressable
                  style={styles.accountRow}
                  onPress={() => {
                    void selectAccount(
                      item.id,
                    );
                  }}
                >
                  <View>
                    <Text
                      style={
                        styles.rowName
                      }
                    >
                      {item.name}
                    </Text>

                    {item.status ===
                      'expired' && (
                      <Text
                        style={
                          styles.expired
                        }
                      >
                        Sign-in required
                      </Text>
                    )}
                  </View>

                  {item.id ===
                    activeAccountId && (
                    <Text>
                      Current
                    </Text>
                  )}
                </Pressable>
              )}
            />

            <Button
              title="Add Account"
              onPress={() => {
                setSwitcherVisible(
                  false,
                );

                onAddAccount();
              }}
            />

            <Button
              title="Session Diagnostics"
              onPress={() => {
                setSwitcherVisible(false);
                onOpenDiagnostics();
              }}
            />

            <Button
              title="Close"
              onPress={() =>
                setSwitcherVisible(
                  false,
                )
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
    },

    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    },

    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 6,
      paddingVertical: 6,
    },

    accountName: {
      flex: 1,
      textAlign: 'center',
      fontWeight: '700',
    },

    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        'rgba(255,255,255,0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor:
        'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },

    sheet: {
      backgroundColor: 'white',
      padding: 20,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
      gap: 12,
    },

    sheetTitle: {
      fontSize: 22,
      fontWeight: '800',
    },

    accountRow: {
      paddingVertical: 14,
      flexDirection: 'row',
      justifyContent:
        'space-between',
    },

    rowName: {
      fontSize: 17,
      fontWeight: '600',
    },

    expired: {
      color: '#b00020',
    },
  });
