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
  onSubmit(name: string): void;
}

export function NameAccountModal({
  visible,
  busy,
  onSubmit,
}: Props) {
  const [name, setName] =
    useState('');

  useEffect(() => {
    if (visible) {
      setName('');
    }
  }, [visible]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            Name this account
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
                : 'Save Account'
            }
            disabled={
              busy ||
              name.trim().length === 0
            }
            onPress={() =>
              onSubmit(name.trim())
            }
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
