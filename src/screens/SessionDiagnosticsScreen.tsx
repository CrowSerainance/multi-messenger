import React, {
  useState,
} from 'react';

import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  clearSessionDiagnostics,
  getSessionDiagnostics,
  type SessionDiagnosticEntry,
} from '../services/sessionDiagnostics';

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
}

function readNewestFirst(): SessionDiagnosticEntry[] {
  return [...getSessionDiagnostics()].reverse();
}

export function SessionDiagnosticsScreen({
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();

  const [entries, setEntries] =
    useState<SessionDiagnosticEntry[]>(
      readNewestFirst,
    );

  const refresh = () => {
    setEntries(readNewestFirst());
  };

  const clear = () => {
    clearSessionDiagnostics();
    setEntries([]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Diagnostics"
        onBack={onBack}
      />

      <Text style={styles.notice}>
        Operation status only. Cookie names and
        values are never recorded.
      </Text>

      <View style={styles.actions}>
        <AppButton
          title="Refresh"
          onPress={refresh}
          variant="secondary"
          style={styles.action}
        />

        <AppButton
          title="Clear"
          onPress={clear}
          disabled={entries.length === 0}
          variant="dangerGhost"
          style={styles.action}
        />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) =>
          item.sequence.toString()
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
            title="No diagnostics yet"
            body="Session operations will appear here if a native cookie or storage call fails or times out."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.entry}>
            <Text style={styles.event}>
              {item.event}
            </Text>

            <Text style={styles.detail}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>

            <Text style={styles.detail}>
              Operation: {item.operation}
            </Text>

            {item.attempt !== undefined && (
              <Text style={styles.detail}>
                Attempt: {item.attempt}
              </Text>
            )}

            {item.errorCode !== undefined && (
              <Text style={styles.errorCode}>
                Code: {item.errorCode}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  notice: {
    color: colors.textMuted,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    lineHeight: 20,
  },

  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },

  action: {
    flex: 1,
  },

  list: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    gap: space.md,
  },

  entry: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.lg,
    gap: 4,
  },

  event: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  detail: {
    color: colors.textMuted,
  },

  errorCode: {
    color: colors.warning,
    fontWeight: '600',
  },
});
