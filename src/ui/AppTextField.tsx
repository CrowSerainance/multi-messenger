import React from 'react';

import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import {
  colors,
  radius,
  space,
} from './theme';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
}

export function AppTextField({
  label,
  hint,
  error,
  style,
  ...rest
}: Props) {
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor={colors.textSubtle}
        style={[
          styles.input,
          error ? styles.inputError : null,
          style,
        ]}
        {...rest}
      />

      {error ? (
        <Text style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },

  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },

  inputError: {
    borderColor: colors.danger,
  },

  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },

  error: {
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
});
