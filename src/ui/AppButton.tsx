import React from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  colors,
  radius,
  space,
} from './theme';

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'dangerGhost';

type Size = 'md' | 'sm' | 'lg';

interface Props {
  title: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  variant?: Variant;
  size?: Size;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  title,
  onPress,
  disabled = false,
  busy = false,
  variant = 'primary',
  size = 'md',
  style,
}: Props) {
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
        busy,
      }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        pressed && !isDisabled
          ? pressedStyles[variant]
          : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={
            variant === 'primary' ||
            variant === 'danger'
              ? colors.surface
              : colors.primary
          }
        />
      ) : (
        <Text
          style={[
            styles.label,
            size === 'sm'
              ? styles.labelSm
              : null,
            labelStyles[variant],
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 48,
    paddingHorizontal: space.lg,
  },

  label: {
    fontSize: 16,
    fontWeight: '700',
  },

  labelSm: {
    fontSize: 14,
  },

  disabled: {
    opacity: 0.45,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  md: {
    minHeight: 48,
  },
  lg: {
    minHeight: 54,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.danger,
  },
  dangerGhost: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primaryPressed,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
  },
  ghost: {
    backgroundColor: colors.primarySoft,
  },
  danger: {
    opacity: 0.9,
  },
  dangerGhost: {
    opacity: 0.85,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: colors.surface,
  },
  secondary: {
    color: colors.text,
  },
  ghost: {
    color: colors.primary,
  },
  danger: {
    color: colors.surface,
  },
  dangerGhost: {
    color: colors.danger,
  },
});
