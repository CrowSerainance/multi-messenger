import React, {
  useState,
} from 'react';

import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  SensitiveScreen,
} from '../components/SensitiveScreen';

import {
  canCompletelyResetLocalData,
  requestCompleteLocalDataReset,
} from '../services/localDataReset';

import {
  useAppLockStore,
} from '../store/appLockStore';

import {
  AppButton,
} from '../ui/AppButton';

import {
  AppTextField,
} from '../ui/AppTextField';

import {
  colors,
  radius,
  space,
} from '../ui/theme';

interface Props {
  onCancel(): void;
}

export function ForgotPinScreen({
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();

  const config =
    useAppLockStore(
      (state) => state.config,
    );

  const biometric =
    useAppLockStore(
      (state) => state.biometric,
    );

  const resetPinWithBiometric =
    useAppLockStore(
      (state) =>
        state.resetPinWithBiometric,
    );

  const [nextPin, setNextPin] =
    useState('');
  const [confirmPin, setConfirmPin] =
    useState('');
  const [resetConfirmation, setResetConfirmation] =
    useState('');
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const biometricRecoveryAvailable =
    !!config?.biometricEnabled &&
    biometric.usable;

  const completeResetAvailable =
    canCompletelyResetLocalData();

  const confirmationMatches =
    resetConfirmation.trim().toUpperCase() ===
    'RESET';

  const recoverWithBiometrics =
    async () => {
      if (busy) {
        return;
      }

      setBusy(true);
      setError(null);

      try {
        await resetPinWithBiometric(
          nextPin,
          confirmPin,
        );
      } catch (recoveryError) {
        setError(
          recoveryError instanceof Error
            ? recoveryError.message
            : 'Unable to reset the PIN.',
        );
      } finally {
        setBusy(false);
      }
    };

  const performCompleteReset =
    async () => {
      setBusy(true);
      setError(null);

      try {
        await requestCompleteLocalDataReset();
      } catch (resetError) {
        setError(
          resetError instanceof Error
            ? resetError.message
            : 'Unable to reset local app data.',
        );
        setBusy(false);
      }
    };

  const confirmCompleteReset = () => {
    if (
      busy ||
      !completeResetAvailable ||
      !confirmationMatches
    ) {
      return;
    }

    Alert.alert(
      'Delete all local app data?',
      'This signs out every saved Messenger session on this device and closes the app. Your Facebook accounts are not deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete & Reset',
          style: 'destructive',
          onPress: () => {
            void performCompleteReset();
          },
        },
      ],
    );
  };

  return (
    <SensitiveScreen
      style={styles.container}
      captureKey="forgot-pin"
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:
              Math.max(insets.top, space.sm) +
              space.lg,
            paddingBottom:
              Math.max(insets.bottom, space.sm) +
              space.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <AppButton
          title="Back to Unlock"
          variant="ghost"
          size="sm"
          onPress={onCancel}
          disabled={busy}
          style={styles.backButton}
        />

        <Text style={styles.kicker}>
          Account security
        </Text>

        <Text style={styles.title}>
          Forgot your app PIN?
        </Text>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={styles.error}
          >
            {error}
          </Text>
        ) : null}

        {biometricRecoveryAvailable ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Keep your saved sessions
            </Text>

            <Text style={styles.body}>
              Verify the strong biometric method
              you previously enabled, then create
              a new app PIN.
            </Text>

            <AppTextField
              label="New PIN"
              value={nextPin}
              onChangeText={setNextPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              editable={!busy}
              placeholder="••••"
            />

            <AppTextField
              label="Confirm new PIN"
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              editable={!busy}
              placeholder="••••"
            />

            <AppButton
              title="Verify & Create New PIN"
              onPress={() => {
                void recoverWithBiometrics();
              }}
              busy={busy}
              disabled={
                nextPin.length === 0 ||
                confirmPin.length === 0
              }
            />
          </View>
        ) : (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>
              Biometric recovery is unavailable
            </Text>

            <Text style={styles.body}>
              It was not enabled before the PIN
              was forgotten, or the device cannot
              use the enrolled biometric method.
            </Text>
          </View>
        )}

        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>
            Reset this app
          </Text>

          <Text style={styles.body}>
            This permanently removes every saved
            account and Messenger session from
            this device. You will need to sign in
            again. It does not delete any Facebook
            account.
          </Text>

          <AppTextField
            label='Type "RESET" to confirm'
            value={resetConfirmation}
            onChangeText={setResetConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={
              !busy && completeResetAvailable
            }
            hint={
              completeResetAvailable
                ? 'Android will clear all private app and website data, then close the app.'
                : 'Complete reset is unavailable on this build.'
            }
          />

          <AppButton
            title="Delete Local Data & Reset App"
            variant="danger"
            onPress={confirmCompleteReset}
            busy={busy}
            disabled={
              !completeResetAvailable ||
              !confirmationMatches
            }
          />
        </View>
      </ScrollView>
    </SensitiveScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },

  backButton: {
    alignSelf: 'flex-start',
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
    marginBottom: space.sm,
  },

  card: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: space.md,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },

  notice: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    gap: space.sm,
  },

  noticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },

  dangerCard: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: colors.dangerSoft,
    gap: space.md,
  },

  dangerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.danger,
  },

  body: {
    color: colors.textMuted,
    lineHeight: 21,
    fontSize: 14,
  },

  error: {
    color: colors.danger,
    lineHeight: 20,
    fontSize: 14,
    fontWeight: '600',
  },
});
