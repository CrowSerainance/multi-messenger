import React, {
  useState,
} from 'react';

import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  clearSessionDiagnostics,
  getSessionDiagnostics,
  type SessionDiagnosticEntry,
} from '../services/sessionDiagnostics';

interface Props {
  onBack(): void;
}

function readNewestFirst(): SessionDiagnosticEntry[] {
  return [...getSessionDiagnostics()].reverse();
}

export function SessionDiagnosticsScreen({
  onBack,
}: Props) {
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
      <View style={styles.toolbar}>
        <Button
          title="Back"
          onPress={onBack}
        />

        <Text style={styles.title}>
          Session Diagnostics
        </Text>
      </View>

      <Text style={styles.notice}>
        Entries contain operation status only. Cookie names and values are never recorded.
      </Text>

      <View style={styles.actions}>
        <Button
          title="Refresh"
          onPress={refresh}
        />

        <Button
          title="Clear"
          onPress={clear}
          disabled={entries.length === 0}
        />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) =>
          item.sequence.toString()
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No session diagnostics recorded.
          </Text>
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

  notice: {
    color: '#555',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },

  list: {
    flexGrow: 1,
    padding: 12,
    gap: 10,
  },

  empty: {
    color: '#777',
    textAlign: 'center',
    marginTop: 32,
  },

  entry: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    gap: 3,
  },

  event: {
    fontSize: 16,
    fontWeight: '700',
  },

  detail: {
    color: '#555',
  },

  errorCode: {
    color: '#9a3412',
    fontWeight: '600',
  },
});
