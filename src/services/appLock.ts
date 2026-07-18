import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import {
  STORAGE_OPERATION_TIMEOUT_MS,
  withNativeOperationTimeout,
} from './nativeOperation';

import {
  SecureStorageError,
} from './sessionErrors';

const LOCK_CONFIG_KEY =
  'messenger.app.lock.v1';

const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;

const SECURE_OPTIONS = {
  keychainAccessible:
    SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface AppLockConfig {
  schemaVersion: 1;
  salt: string;
  pinHash: string;
  biometricEnabled: boolean;
}

export interface BiometricAvailability {
  hardware: boolean;
  enrolled: boolean;
  usable: boolean;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function runSecureStore<T>(
  operation: 'secure-read' | 'secure-write',
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await withNativeOperationTimeout(
      operation,
      STORAGE_OPERATION_TIMEOUT_MS,
      execute,
    );
  } catch (error) {
    throw new SecureStorageError(error);
  }
}

export function normalizePin(pin: string): string {
  return pin.replace(/\D/g, '');
}

export function isValidPin(pin: string): boolean {
  const normalized = normalizePin(pin);

  return (
    normalized.length >= MIN_PIN_LENGTH &&
    normalized.length <= MAX_PIN_LENGTH &&
    normalized === pin.trim()
  );
}

export function pinValidationMessage(
  pin: string,
): string | null {
  const normalized = normalizePin(pin);

  if (normalized.length < MIN_PIN_LENGTH) {
    return `PIN must be at least ${MIN_PIN_LENGTH} digits.`;
  }

  if (normalized.length > MAX_PIN_LENGTH) {
    return `PIN must be at most ${MAX_PIN_LENGTH} digits.`;
  }

  if (normalized !== pin.trim()) {
    return 'PIN may contain digits only.';
  }

  return null;
}

async function hashPin(
  pin: string,
  salt: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${normalizePin(pin)}`,
  );
}

export async function loadLockConfig():
Promise<AppLockConfig | null> {
  const raw = await runSecureStore(
    'secure-read',
    () => SecureStore.getItemAsync(
      LOCK_CONFIG_KEY,
      SECURE_OPTIONS,
    ),
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppLockConfig>;

    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.salt !== 'string' ||
      parsed.salt.length === 0 ||
      typeof parsed.pinHash !== 'string' ||
      parsed.pinHash.length === 0 ||
      typeof parsed.biometricEnabled !== 'boolean'
    ) {
      return null;
    }

    return {
      schemaVersion: 1,
      salt: parsed.salt,
      pinHash: parsed.pinHash,
      biometricEnabled: parsed.biometricEnabled,
    };
  } catch {
    return null;
  }
}

async function saveLockConfig(
  config: AppLockConfig,
): Promise<void> {
  await runSecureStore(
    'secure-write',
    () => SecureStore.setItemAsync(
      LOCK_CONFIG_KEY,
      JSON.stringify(config),
      SECURE_OPTIONS,
    ),
  );
}

export async function createLockConfig(
  pin: string,
  biometricEnabled: boolean,
): Promise<AppLockConfig> {
  const validationError = pinValidationMessage(pin);

  if (validationError) {
    throw new Error(validationError);
  }

  const salt = bytesToHex(
    await Crypto.getRandomBytesAsync(16),
  );

  const pinHash = await hashPin(pin, salt);

  const config: AppLockConfig = {
    schemaVersion: 1,
    salt,
    pinHash,
    biometricEnabled,
  };

  await saveLockConfig(config);
  return config;
}

export async function verifyPin(
  pin: string,
  config: AppLockConfig,
): Promise<boolean> {
  const candidate = await hashPin(pin, config.salt);
  return candidate === config.pinHash;
}

export async function changePin(
  currentPin: string,
  nextPin: string,
  config: AppLockConfig,
): Promise<AppLockConfig> {
  const currentValid = await verifyPin(
    currentPin,
    config,
  );

  if (!currentValid) {
    throw new Error('Current PIN is incorrect.');
  }

  return createLockConfig(
    nextPin,
    config.biometricEnabled,
  );
}

export async function setBiometricEnabled(
  enabled: boolean,
  config: AppLockConfig,
): Promise<AppLockConfig> {
  if (enabled) {
    const availability =
      await getBiometricAvailability();

    if (!availability.usable) {
      throw new Error(
        'Biometric unlock is not available on this device.',
      );
    }
  }

  const next: AppLockConfig = {
    ...config,
    biometricEnabled: enabled,
  };

  await saveLockConfig(next);
  return next;
}

export async function getBiometricAvailability():
Promise<BiometricAvailability> {
  const hardware =
    await LocalAuthentication.hasHardwareAsync();
  const enrolled =
    hardware
      ? await LocalAuthentication.isEnrolledAsync()
      : false;

  return {
    hardware,
    enrolled,
    usable: hardware && enrolled,
  };
}

export async function authenticateWithBiometrics(
  promptMessage = 'Unlock Messenger Sessions',
): Promise<boolean> {
  const availability =
    await getBiometricAvailability();

  if (!availability.usable) {
    return false;
  }

  const result =
    await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    });

  return result.success;
}
