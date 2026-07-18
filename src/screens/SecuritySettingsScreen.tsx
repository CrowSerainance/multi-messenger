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
  onBack(): void;
  onOpenPrivacy(): void;
}

export function SecuritySettingsScreen({
  onBack,
  onOpenPrivacy,
}: Props) {
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
      <View style={styles.toolbar}>
        <Button
          title="Back"
          onPress={onBack}
          disabled={busy}
        />

        <Text style={styles.title}>
          Security
        </Text>
      </View>

      <Text style={styles.section}>
        App PIN
      </Text>

      <TextInput
        value={currentPin}
        onChangeText={setCurrentPin}
        placeholder="Current PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.input}
      />

      <TextInput
        value={nextPin}
        onChangeText={setNextPin}
        placeholder="New PIN (4-8 digits)"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.input}
      />

      <TextInput
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="Confirm new PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!busy}
        style={styles.input}
      />

      <Button
        title="Change PIN"
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

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            Biometric unlock
          </Text>

          <Text style={styles.rowHint}>
            {biometric.usable
              ? 'Unlock with fingerprint or face after the app locks.'
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
        />
      </View>

      <Text style={styles.section}>
        Storage backup
      </Text>

      <Text style={styles.body}>
        Session cookies are stored only in
        SecureStore with
        WHEN_UNLOCKED_THIS_DEVICE_ONLY.
        Android Auto Backup is configured to
        exclude SecureStore data, so cookie
        snapshots are not synced to cloud
        backup.
      </Text>

      <Button
        title="Privacy Policy"
        onPress={onOpenPrivacy}
        disabled={busy}
      />

      {message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}

      {error && (
        <Text style={styles.error}>
          {error}
        </Text>
      )}

      {busy && (
        <ActivityIndicator size="large" />
      )}
    </SensitiveScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    gap: 12,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },

  title: {
    fontSize: 20,
    fontWeight: '800',
  },

  section: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 3,
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

  body: {
    color: '#444',
    lineHeight: 20,
  },

  message: {
    color: '#1a6b1a',
  },

  error: {
    color: '#b00020',
  },
});
