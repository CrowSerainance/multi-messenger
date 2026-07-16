import React from 'react';

import {
  Button,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useAccountStore,
} from '../store/accountStore';

interface Props {
  onSelectAccount(
    accountId: string,
  ): void;
  onAddAccount(): void;
}

export function HomeScreen({
  onSelectAccount,
  onAddAccount,
}: Props) {
  const accounts =
    useAccountStore(
      (state) =>
        state.accounts,
    );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        Messenger Accounts
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
          >
            <View>
              <Text style={styles.name}>
                {item.name}
              </Text>

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

      <Button
        title="Add Account"
        onPress={onAddAccount}
      />
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
      marginBottom: 20,
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

    name: {
      fontSize: 18,
      fontWeight: '700',
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
