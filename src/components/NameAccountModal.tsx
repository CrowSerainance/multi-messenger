import React, {
  useEffect,
  useState,
} from 'react';

import {
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppButton,
} from '../ui/AppButton';

import {
  AppTextField,
} from '../ui/AppTextField';

import {
  radius,
  space,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

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
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

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

          <Text style={styles.body}>
            Pick a short label you’ll recognize
            later, like Work or Personal.
          </Text>

          <AppTextField
            value={name}
            onChangeText={setName}
            placeholder="Work, Personal, Client…"
            editable={!busy}
            autoFocus
            onSubmitEditing={() => {
              if (
                !busy &&
                name.trim().length > 0
              ) {
                onSubmit(name.trim());
              }
            }}
          />

          <AppButton
            title={
              busy
                ? 'Saving…'
                : submitLabel
            }
            busy={busy}
            disabled={
              busy ||
              name.trim().length === 0
            }
            onPress={() =>
              onSubmit(name.trim())
            }
          />

          <AppButton
            title="Cancel"
            variant="ghost"
            disabled={busy}
            onPress={onCancel}
          />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      padding: space.xl,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: space.xl,
      gap: space.md,
    },

    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
    },

    body: {
      color: colors.textMuted,
      lineHeight: 20,
      marginTop: -4,
    },
  });
