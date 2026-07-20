import React from 'react';

import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  AppButton,
} from './AppButton';

import {
  colors,
  space,
} from './theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  right,
  style,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop:
            Math.max(insets.top, space.sm) +
            space.sm,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <AppButton
            title={backLabel}
            onPress={onBack}
            variant="ghost"
            size="sm"
            style={styles.side}
          />
        ) : (
          <View style={styles.side} />
        )}

        <View style={styles.center}>
          <Text
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>

          {subtitle ? (
            <Text
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={[styles.side, styles.right]}>
          {right}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },

  side: {
    minWidth: 72,
  },

  right: {
    alignItems: 'flex-end',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },

  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
