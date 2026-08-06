import React from 'react';

import {
  Alert,
  FlatList,
  Pressable,
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
} from '../store/accountStore';

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
  radius,
  space,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

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
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();

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
    <View
      style={[
        styles.container,
        {
          paddingTop:
            Math.max(insets.top, space.sm) +
            space.lg,
          paddingBottom:
            Math.max(insets.bottom, space.sm) +
            space.md,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.heading}>
          Messenger Sessions
        </Text>

        <Text style={styles.hint}>
          Tap an account to open it. Press and
          hold to remove.
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
          <EmptyState
            title="No accounts yet"
            body="Add a Messenger account to save its session on this device and switch between accounts later."
            actionLabel="Add Account"
            onAction={onAddAccount}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.name}`}
            style={({ pressed }) => [
              styles.account,
              pressed
                ? styles.accountPressed
                : null,
            ]}
            onPress={() =>
              onSelectAccount(
                item.id,
              )
            }
            onLongPress={() =>
              confirmDelete(item)
            }
          >
            <View style={styles.accountBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>
                  {item.name}
                </Text>

                {item.id ===
                  defaultAccountId && (
                  <AppBadge
                    label="Default"
                    tone="success"
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

              <Text style={styles.status}>
                {item.status ===
                'expired'
                  ? 'Open to sign in again'
                  : 'Saved session ready'}
              </Text>
            </View>

            <Text style={styles.chevron}>
              ›
            </Text>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <AppButton
          title="Add Account"
          onPress={onAddAccount}
        />

        <AppButton
          title="Manage Accounts"
          onPress={onManageAccounts}
          variant="secondary"
        />

        <View style={styles.footerRow}>
          <AppButton
            title="Security"
            onPress={onOpenSecurity}
            variant="ghost"
            style={styles.footerHalf}
          />

          <AppButton
            title="Privacy"
            onPress={onOpenPrivacy}
            variant="ghost"
            style={styles.footerHalf}
          />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: space.xl,
      backgroundColor: colors.background,
    },

    header: {
      marginBottom: space.lg,
      gap: space.sm,
    },

    heading: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
    },

    hint: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 21,
    },

    list: {
      gap: space.md,
      flexGrow: 1,
      paddingBottom: space.lg,
    },

    account: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      padding: space.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      gap: space.md,
    },

    accountPressed: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primaryBorder,
    },

    accountBody: {
      flex: 1,
      gap: 4,
    },

    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.sm,
    },

    name: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },

    status: {
      color: colors.textMuted,
      fontSize: 14,
    },

    chevron: {
      fontSize: 24,
      color: colors.textSubtle,
      fontWeight: '300',
    },

    footer: {
      gap: space.sm,
      paddingTop: space.sm,
    },

    footerRow: {
      flexDirection: 'row',
      gap: space.sm,
    },

    footerHalf: {
      flex: 1,
    },
  });
