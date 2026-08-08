import React, {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
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
  SensitiveScreen,
} from '../components/SensitiveScreen';

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
  title?: string;
  subtitle?: string;
}

export function SetupPinScreen({
  title = 'Protect your sessions',
  subtitle =
    'Create a PIN before saved Messenger sessions can be opened. Biometrics are optional.',
}: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();

  const biometric =
    useAppLockStore(
      (state) => state.biometric,
    );

  const setupPin =
    useAppLockStore(
      (state) => state.setupPin,
    );

  const refreshBiometricAvailability =
    useAppLockStore(
      (state) =>
        state.refreshBiometricAvailability,
    );

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] =
    useState('');
  const [enableBiometric, setEnableBiometric] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    void refreshBiometricAvailability();
  }, [refreshBiometricAvailability]);

  useEffect(() => {
    if (!biometric.usable) {
      setEnableBiometric(false);
    }
  }, [biometric.usable]);

  const submit = async () => {
    const validationError =
      pinValidationMessage(pin);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (pin !== confirmPin) {
      setError('PIN entries do not match.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await setupPin(
        pin,
        confirmPin,
        enableBiometric && biometric.usable,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save PIN.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SensitiveScreen
      style={[
        styles.container,
        {
          paddingTop:
            Math.max(insets.top, space.sm) +
            40,
          paddingBottom:
            Math.max(insets.bottom, space.sm) +
            space.xl,
        },
      ]}
      captureKey="setup-pin"
    >
      <Text style={styles.kicker}>
        First-time setup
      </Text>

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.subtitle}>
        {subtitle}
      </Text>

      <AppTextField
        label="Create PIN"
        value={pin}
        onChangeText={setPin}
        placeholder="4–8 digits"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.pinInput}
        hint="You’ll need this every time the app opens."
      />

      <AppTextField
        label="Confirm PIN"
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Repeat PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.pinInput}
        error={error}
      />

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            Unlock with biometrics
          </Text>

          <Text style={styles.rowHint}>
            {biometric.usable
              ? 'Use fingerprint or face after setup.'
              : biometric.enrolled
                ? 'A strong biometric is required.'
                : 'No enrolled biometrics on this device.'}
          </Text>
        </View>

        <Switch
          value={
            enableBiometric &&
            biometric.usable
          }
          onValueChange={setEnableBiometric}
          disabled={
            busy || !biometric.usable
          }
          trackColor={{
            false: colors.borderStrong,
            true: colors.primaryBorder,
          }}
          thumbColor={
            enableBiometric && biometric.usable
              ? colors.primary
              : colors.surface
          }
        />
      </View>

      {busy ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
      ) : (
        <AppButton
          title="Save PIN & Continue"
          onPress={() => {
            void submit();
          }}
          disabled={
            pin.length === 0 ||
            confirmPin.length === 0
          }
        />
      )}
    </SensitiveScreen>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.xl,
    backgroundColor: colors.background,
    gap: space.md,
  },

  kicker: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    color: colors.textMuted,
    marginBottom: space.sm,
    lineHeight: 22,
    fontSize: 15,
  },

  pinInput: {
    letterSpacing: 4,
    fontSize: 18,
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
});
