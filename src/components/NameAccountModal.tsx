import React, {
  useEffect,
  useState,
} from 'react';

import {
  Button,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  busy: boolean;
  title?: string;
  submitLabel?: string;
  initialName?: string;
  onSubmit(name: string): void;
  onCancel(): void;
}

export function NameAccountModal({
  visible,
  busy,
  title = 'Name this account',
  submitLabel = 'Save Account',
  initialName = '',
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] =
    useState(initialName);

  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {title}
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Work, Personal, Client..."
            editable={!busy}
            autoFocus
            style={styles.input}
          />

          <Button
            title={
              busy
                ? 'Saving...'
                : submitLabel
            }
            disabled={
              busy ||
              name.trim().length === 0
            }
            onPress={() =>
              onSubmit(name.trim())
            }
          />

          <Button
            title="Cancel"
            disabled={busy}
            onPress={onCancel}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor:
        'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 24,
    },

    card: {
      backgroundColor: 'white',
      borderRadius: 16,
      padding: 20,
      gap: 16,
    },

    title: {
      fontSize: 20,
      fontWeight: '700',
    },

    input: {
      borderWidth: 1,
      borderColor: '#aaa',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
  });
