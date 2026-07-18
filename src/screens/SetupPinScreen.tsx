import React, {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  pinValidationMessage,
} from '../services/appLock';

import {
  useAppLockStore,
} from '../store/appLockStore';

import {
  SensitiveScreen,
} from '../components/SensitiveScreen';

interface Props {
  title?: string;
  subtitle?: string;
}

export function SetupPinScreen({
  title = 'Protect this app',
  subtitle =
    'Create a PIN before saved Messenger sessions can be opened. Biometrics are optional.',
}: Props) {
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
      style={styles.container}
      captureKey="setup-pin"
    >
      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.subtitle}>
        {subtitle}
      </Text>

      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="Create PIN (4-8 digits)"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Confirm PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.input}
      />

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            Unlock with biometrics
          </Text>

          <Text style={styles.rowHint}>
            {biometric.usable
              ? 'Use fingerprint or face after PIN setup.'
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
        />
      </View>

      {error && (
        <Text style={styles.error}>
          {error}
        </Text>
      )}

      {busy ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button
          title="Save PIN"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 72,
    backgroundColor: 'white',
    gap: 14,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
  },

  subtitle: {
    color: '#555',
    marginBottom: 8,
    lineHeight: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    letterSpacing: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },

  rowText: {
    flex: 1,
    gap: 4,
  },

  rowTitle: {
    fontWeight: '700',
    fontSize: 16,
  },

  rowHint: {
    color: '#666',
    fontSize: 13,
  },

  error: {
    color: '#b00020',
  },
});
