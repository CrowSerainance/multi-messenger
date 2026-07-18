import React from 'react';

import {
  Alert,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  Account,
} from '../types/session';

import {
  useAccountStore,
} from '../store/accountStore';

interface Props {
  onSelectAccount(
    accountId: string,
  ): void;
  onAddAccount(): void;
  onManageAccounts(): void;
  onOpenSecurity(): void;
  onOpenPrivacy(): void;
}

export function HomeScreen({
  onSelectAccount,
  onAddAccount,
  onManageAccounts,
  onOpenSecurity,
  onOpenPrivacy,
}: Props) {
  const accounts =
    useAccountStore(
      (state) =>
        state.accounts,
    );

  const removeAccount =
    useAccountStore(
      (state) =>
        state.removeAccount,
    );

  const defaultAccountId =
    useAccountStore(
      (state) =>
        state.defaultAccountId,
    );

  const confirmDelete = (
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
            void removeAccount(
              account.id,
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        Messenger Accounts
      </Text>

      <Text style={styles.hint}>
        Tap to open · hold to remove
      </Text>

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
        renderItem={({ item }) => (
          <Pressable
            style={styles.account}
            onPress={() =>
              onSelectAccount(
                item.id,
              )
            }
            onLongPress={() =>
              confirmDelete(item)
            }
          >
            <View>
              <View style={styles.nameRow}>
                <Text style={styles.name}>
                  {item.name}
                </Text>

                {item.id ===
                  defaultAccountId && (
                  <Text style={styles.defaultBadge}>
                    Default
                  </Text>
                )}
              </View>

              <Text
                style={
                  item.status ===
                  'expired'
                    ? styles.expired
                    : styles.status
                }
              >
                {item.status ===
                'expired'
                  ? 'Sign-in required'
                  : 'Saved session'}
              </Text>
            </View>

            <Text>›</Text>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Button
          title="Add Account"
          onPress={onAddAccount}
        />

        <Button
          title="Manage Accounts"
          onPress={onManageAccounts}
        />

        <Button
          title="Security"
          onPress={onOpenSecurity}
        />

        <Button
          title="Privacy"
          onPress={onOpenPrivacy}
        />
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      paddingTop: 48,
    },

    heading: {
      fontSize: 26,
      fontWeight: '800',
      marginBottom: 4,
    },

    hint: {
      color: '#888',
      marginBottom: 16,
    },

    list: {
      gap: 10,
      flexGrow: 1,
    },

    account: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      padding: 16,
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 12,
    },

    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    name: {
      fontSize: 18,
      fontWeight: '700',
    },

    defaultBadge: {
      color: '#1a6b1a',
      fontWeight: '700',
    },

    footer: {
      gap: 8,
    },

    status: {
      color: '#555',
      marginTop: 4,
    },

    expired: {
      color: '#b00020',
      marginTop: 4,
    },

    empty: {
      color: '#777',
    },
  });
