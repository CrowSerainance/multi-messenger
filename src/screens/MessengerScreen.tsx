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
  colors,
  radius,
  space,
} from '../ui/theme';

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
              Only one Messenger session is
              active at a time.
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

const styles =
  StyleSheet.create({
    container: {
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
        'rgba(255,255,255,0.82)',
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
      backgroundColor: '#EEF2FF',
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
