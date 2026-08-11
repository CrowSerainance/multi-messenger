import React, {
  useEffect,
  useState,
} from 'react';

import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  pinValidationMessage,
} from '../services/appLock';

import {
  useAppLockStore,
} from '../store/appLockStore';

import {
  usePreferencesStore,
} from '../store/preferencesStore';

import {
  SensitiveScreen,
} from '../components/SensitiveScreen';

import {
  AppButton,
} from '../ui/AppButton';

import {
  AppTextField,
} from '../ui/AppTextField';

import {
  ScreenHeader,
} from '../ui/ScreenHeader';

import {
  radius,
  space,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

interface Props {
  onBack(): void;
  onOpenPrivacy(): void;
}

export function SecuritySettingsScreen({
  onBack,
  onOpenPrivacy,
}: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();

  const config =
    useAppLockStore(
      (state) => state.config,
    );

  const biometric =
    useAppLockStore(
      (state) => state.biometric,
    );

  const updatePin =
    useAppLockStore(
      (state) => state.updatePin,
    );

  const toggleBiometric =
    useAppLockStore(
      (state) => state.toggleBiometric,
    );

  const refreshBiometricAvailability =
    useAppLockStore(
      (state) =>
        state.refreshBiometricAvailability,
    );

  const allowScreenCapture =
    usePreferencesStore(
      (state) => state.allowScreenCapture,
    );

  const setAllowScreenCapture =
    usePreferencesStore(
      (state) => state.setAllowScreenCapture,
    );

  const [currentPin, setCurrentPin] =
    useState('');
  const [nextPin, setNextPin] =
    useState('');
  const [confirmPin, setConfirmPin] =
    useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    void refreshBiometricAvailability();
  }, [refreshBiometricAvailability]);

  const savePin = async () => {
    const validationError =
      pinValidationMessage(nextPin);

    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await updatePin(
        currentPin,
        nextPin,
        confirmPin,
      );

      setCurrentPin('');
      setNextPin('');
      setConfirmPin('');
      setMessage('PIN updated.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update PIN.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onToggleScreenCapture = async (
    allowed: boolean,
  ) => {
    setError(null);
    setMessage(null);

    try {
      await setAllowScreenCapture(allowed);

      setMessage(
        allowed
          ? 'Screenshots are allowed.'
          : 'Screenshots are blocked again.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save the screenshot setting.',
      );
    }
  };

  const onToggleBiometric = async (
    enabled: boolean,
  ) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await toggleBiometric(enabled);
      setMessage(
        enabled
          ? 'Biometric unlock enabled.'
          : 'Biometric unlock disabled.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update biometrics.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SensitiveScreen
      style={styles.container}
      captureKey="security-settings"
    >
      <ScreenHeader
        title="Security"
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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>
          Change PIN
        </Text>

        <AppTextField
          label="Current PIN"
          value={currentPin}
          onChangeText={setCurrentPin}
          placeholder="Enter current PIN"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          editable={!busy}
          style={styles.pinInput}
        />

        <AppTextField
          label="New PIN"
          value={nextPin}
          onChangeText={setNextPin}
          placeholder="4–8 digits"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          editable={!busy}
          style={styles.pinInput}
        />

        <AppTextField
          label="Confirm new PIN"
          value={confirmPin}
          onChangeText={setConfirmPin}
          placeholder="Repeat new PIN"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          editable={!busy}
          style={styles.pinInput}
          error={error}
        />

        <AppButton
          title="Update PIN"
          busy={busy}
          onPress={() => {
            void savePin();
          }}
          disabled={
            busy ||
            currentPin.length === 0 ||
            nextPin.length === 0 ||
            confirmPin.length === 0
          }
        />

        {message ? (
          <Text style={styles.message}>
            {message}
          </Text>
        ) : null}

        <Text style={styles.section}>
          Biometrics
        </Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              Unlock with biometrics
            </Text>

            <Text style={styles.rowHint}>
              {biometric.usable
                ? 'Use fingerprint or face after the app locks.'
                : biometric.enrolled
                  ? 'A strong biometric is required.'
                  : 'Enroll biometrics in system settings to enable this.'}
            </Text>
          </View>

          <Switch
            value={
              !!config?.biometricEnabled &&
              biometric.usable
            }
            onValueChange={(value) => {
              void onToggleBiometric(value);
            }}
            disabled={
              busy || !biometric.usable
            }
            trackColor={{
              false: colors.borderStrong,
              true: colors.primaryBorder,
            }}
            thumbColor={
              config?.biometricEnabled &&
              biometric.usable
                ? colors.primary
                : colors.surface
            }
          />
        </View>

        <Text style={styles.section}>
          Screenshots
        </Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              Allow screenshots
            </Text>

            <Text style={styles.rowHint}>
              {allowScreenCapture
                ? 'Screenshots and screen recording work. Open chats also show in the app switcher preview.'
                : 'Screenshots and screen recording are blocked, and the app switcher preview stays blank.'}
            </Text>
          </View>

          <Switch
            value={allowScreenCapture}
            onValueChange={(value) => {
              void onToggleScreenCapture(value);
            }}
            disabled={busy}
            trackColor={{
              false: colors.borderStrong,
              true: colors.primaryBorder,
            }}
            thumbColor={
              allowScreenCapture
                ? colors.primary
                : colors.surface
            }
          />
        </View>

        <Text style={styles.section}>
          Storage backup
        </Text>

        <Text style={styles.body}>
          Session cookies stay in SecureStore on
          this device and are excluded from
          Android cloud backup.
        </Text>

        <AppButton
          title="Privacy Policy"
          variant="secondary"
          onPress={onOpenPrivacy}
          disabled={busy}
        />
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
    padding: space.lg,
    gap: space.md,
  },

  section: {
    marginTop: space.sm,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  pinInput: {
    letterSpacing: 3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  rowText: {
    flex: 1,
    gap: 4,
  },

  rowTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: colors.text,
  },

  rowHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },

  body: {
    color: colors.textMuted,
    lineHeight: 21,
    fontSize: 15,
  },

  message: {
    color: colors.success,
    fontWeight: '600',
  },
});
