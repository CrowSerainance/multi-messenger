import React from 'react';

import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppButton,
} from './AppButton';

import {
  space,
  useThemedStyles,
  type ThemeColors,
} from './theme';

interface Props {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.body}>
        {body}
      </Text>

      {actionLabel && onAction ? (
        <AppButton
          title={actionLabel}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
    wrap: {
      alignItems: 'center',
      paddingHorizontal: space.xl,
      paddingVertical: 48,
      gap: space.md,
    },

    title: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },

    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted,
      textAlign: 'center',
    },

    action: {
      marginTop: space.sm,
      alignSelf: 'stretch',
    },
  });
