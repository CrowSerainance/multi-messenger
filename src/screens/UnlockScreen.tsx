import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

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
  colors,
  space,
} from '../ui/theme';

export function UnlockScreen() {
  const insets = useSafeAreaInsets();

  const config =
    useAppLockStore(
      (state) => state.config,
    );

  const biometric =
    useAppLockStore(
      (state) => state.biometric,
    );

  const error =
    useAppLockStore(
      (state) => state.error,
    );

  const unlockWithPin =
    useAppLockStore(
      (state) => state.unlockWithPin,
    );

  const unlockWithBiometric =
    useAppLockStore(
      (state) =>
        state.unlockWithBiometric,
    );

  const refreshBiometricAvailability =
    useAppLockStore(
      (state) =>
        state.refreshBiometricAvailability,
    );

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] =
    useState(0);
  const [now, setNow] = useState(
    Date.now(),
  );
  const attemptedBiometric =
    useRef(false);

  const biometricAllowed =
    !!config?.biometricEnabled &&
    biometric.usable;

  const cooldownRemainingMs = Math.max(
    0,
    cooldownUntil - now,
  );

  useEffect(() => {
    void refreshBiometricAvailability();
  }, [refreshBiometricAvailability]);

  useEffect(() => {
    if (cooldownRemainingMs <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [cooldownRemainingMs]);

  useEffect(() => {
    if (
      !biometricAllowed ||
      attemptedBiometric.current
    ) {
      return;
    }

    attemptedBiometric.current = true;

    void unlockWithBiometric();
  }, [biometricAllowed, unlockWithBiometric]);

  const submitPin = async () => {
    if (
      busy ||
      pin.length === 0 ||
      cooldownRemainingMs > 0
    ) {
      return;
    }

    setBusy(true);

    try {
      const unlocked =
        await unlockWithPin(pin);

      if (!unlocked) {
        setPin('');

        const nextAttempts =
          useAppLockStore.getState()
            .failedAttempts;

        if (nextAttempts >= 3) {
          const delayMs = Math.min(
            nextAttempts * 2000,
            10_000,
          );

          setCooldownUntil(
            Date.now() + delayMs,
          );
          setNow(Date.now());
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const retryBiometric = async () => {
    setBusy(true);

    try {
      await unlockWithBiometric();
    } finally {
      setBusy(false);
    }
  };

  const cooldownSeconds = Math.ceil(
    cooldownRemainingMs / 1000,
  );

  return (
    <SensitiveScreen
      style={[
        styles.container,
        {
          paddingTop:
            Math.max(insets.top, space.sm) +
            48,
          paddingBottom:
            Math.max(insets.bottom, space.sm) +
            space.xl,
        },
      ]}
      captureKey="unlock"
    >
      <Text style={styles.kicker}>
        Messenger Sessions
      </Text>

      <Text style={styles.title}>
        Welcome back
      </Text>

      <Text style={styles.subtitle}>
        Enter your app PIN to open saved
        Messenger sessions on this device.
      </Text>

      <AppTextField
        label="App PIN"
        value={pin}
        onChangeText={setPin}
        placeholder="••••"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={
          !busy &&
          cooldownRemainingMs === 0
        }
        style={styles.pinInput}
        error={error}
        hint={
          cooldownRemainingMs > 0
            ? `Too many failed attempts. Try again in ${cooldownSeconds}s.`
            : 'PIN is stored only on this device.'
        }
        onSubmitEditing={() => {
          void submitPin();
        }}
      />

      {busy ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
      ) : (
        <View style={styles.actions}>
          <AppButton
            title="Unlock"
            onPress={() => {
              void submitPin();
            }}
            disabled={
              pin.length === 0 ||
              cooldownRemainingMs > 0
            }
          />

          {biometricAllowed && (
            <AppButton
              title="Use Biometrics"
              variant="secondary"
              onPress={() => {
                void retryBiometric();
              }}
              disabled={
                cooldownRemainingMs > 0
              }
            />
          )}
        </View>
      )}
    </SensitiveScreen>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    color: colors.textMuted,
    lineHeight: 22,
    fontSize: 15,
    marginBottom: space.sm,
  },

  pinInput: {
    letterSpacing: 8,
    fontSize: 22,
    textAlign: 'center',
  },

  actions: {
    gap: space.sm,
    marginTop: space.sm,
  },
});
