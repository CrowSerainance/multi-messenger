import React from 'react';

import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  colors,
  radius,
  space,
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
  return (
    <View
      style={[
        styles.badge,
        toneStyles[tone],
      ]}
    >
      <Text
        style={[
          styles.label,
          labelToneStyles[tone],
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },

  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});

const toneStyles = StyleSheet.create({
  neutral: {
    backgroundColor: '#E2E8F0',
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
});

const labelToneStyles = StyleSheet.create({
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
});
