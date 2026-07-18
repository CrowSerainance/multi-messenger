import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  useAppLockStore,
} from '../store/appLockStore';

import {
  SensitiveScreen,
} from '../components/SensitiveScreen';

export function UnlockScreen() {
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
      style={styles.container}
      captureKey="unlock"
    >
      <Text style={styles.title}>
        Unlock
      </Text>

      <Text style={styles.subtitle}>
        Enter your app PIN to open saved
        Messenger sessions.
      </Text>

      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="App PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={
          !busy &&
          cooldownRemainingMs === 0
        }
        style={styles.input}
        onSubmitEditing={() => {
          void submitPin();
        }}
      />

      {error && (
        <Text style={styles.error}>
          {error}
        </Text>
      )}

      {cooldownRemainingMs > 0 && (
        <Text style={styles.hint}>
          Too many failed attempts. Try
          again in {cooldownSeconds}s.
        </Text>
      )}

      {busy ? (
        <ActivityIndicator size="large" />
      ) : (
        <View style={styles.actions}>
          <Button
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
            <Button
              title="Use Biometrics"
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
    padding: 24,
    paddingTop: 96,
    backgroundColor: 'white',
    gap: 14,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
  },

  subtitle: {
    color: '#555',
    lineHeight: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 6,
  },

  error: {
    color: '#b00020',
  },

  hint: {
    color: '#666',
  },

  actions: {
    gap: 10,
  },
});
