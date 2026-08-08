import React from 'react';

import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  radius,
  space,
  useThemedStyles,
  type ThemeColors,
} from './theme';

type Tone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning';

interface Props {
  label: string;
  tone?: Tone;
}

export function AppBadge({
  label,
  tone = 'neutral',
}: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      style={[
        styles.base.badge,
        styles.tone[tone],
      ]}
    >
      <Text
        style={[
          styles.base.label,
          styles.labelTone[tone],
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const makeStyles = (
  colors: ThemeColors,
) => ({
  base: StyleSheet.create({
    badge: {
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },

    label: {
      fontSize: 12,
      fontWeight: '700',
    },
  }),

  tone: StyleSheet.create({
    neutral: {
      backgroundColor: colors.neutralSoft,
    },
    primary: {
      backgroundColor: colors.primarySoft,
    },
    success: {
      backgroundColor: colors.successSoft,
    },
    danger: {
      backgroundColor: colors.dangerSoft,
    },
    warning: {
      backgroundColor: colors.warningSoft,
    },
  }),

  labelTone: StyleSheet.create({
    neutral: {
      color: colors.textMuted,
    },
    primary: {
      color: colors.primary,
    },
    success: {
      color: colors.success,
    },
    danger: {
      color: colors.danger,
    },
    warning: {
      color: colors.warning,
    },
  }),
});
