import React from 'react';

import {
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  SensitiveScreen,
} from '../components/SensitiveScreen';

import {
  ScreenHeader,
} from '../ui/ScreenHeader';

import {
  space,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

interface Props {
  onBack(): void;
}

export function PrivacyPolicyScreen({
  onBack,
}: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();

  return (
    <SensitiveScreen
      style={styles.container}
      captureKey="privacy"
    >
      <ScreenHeader
        title="Privacy"
        onBack={onBack}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              Math.max(
                insets.bottom,
                space.sm,
              ) + space.xl,
          },
        ]}
      >
        <Text style={styles.heading}>
          How this app handles your data
        </Text>

        <Text style={styles.body}>
          Messenger Sessions stores Facebook /
          Messenger cookies only on this device
          in encrypted SecureStore. Cookie values
          are never written to AsyncStorage, never
          printed to logs, and are never sent to a
          remote analytics or backend service by
          this app.
        </Text>

        <Text style={styles.body}>
          An app PIN is required before saved
          sessions can be read. Optional biometric
          unlock is only a convenience layer for
          that same local unlock step. Screenshots
          are blocked on sensitive screens.
        </Text>

        <Text style={styles.body}>
          Cookie snapshots are excluded from
          Android Auto Backup. Deleting an account
          deletes its stored cookie snapshot from
          this device.
        </Text>

        <Text style={styles.body}>
          Messenger itself is operated by Meta.
          Your use of Messenger remains subject to
          Meta’s terms and privacy policy. This
          notice covers only the local
          multi-account wrapper on your device.
        </Text>

        <Text style={styles.note}>
          Expand this notice with jurisdiction-
          specific legal language before any public
          distribution.
        </Text>
      </ScrollView>
    </SensitiveScreen>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    padding: space.xl,
    gap: space.lg,
  },

  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },

  body: {
    color: colors.text,
    lineHeight: 23,
    fontSize: 15,
  },

  note: {
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 21,
  },
});
