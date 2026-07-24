import { create } from 'zustand';

import {
  authenticateWithBiometrics,
  changePin,
  createLockConfig,
  getBiometricAvailability,
  loadLockConfig,
  pinValidationMessage,
  setBiometricEnabled,
  verifyPin,
  type AppLockConfig,
  type BiometricAvailability,
} from '../services/appLock';

interface AppLockStore {
  ready: boolean;
  unlocked: boolean;
  config: AppLockConfig | null;
  biometric: BiometricAvailability;
  error: string | null;
  failedAttempts: number;

  bootstrap(): Promise<void>;
  setupPin(
    pin: string,
    confirmPin: string,
    enableBiometric: boolean,
  ): Promise<void>;
  unlockWithPin(pin: string): Promise<boolean>;
  unlockWithBiometric(): Promise<boolean>;
  resetPinWithBiometric(
    nextPin: string,
    confirmPin: string,
  ): Promise<void>;
  lock(): void;
  updatePin(
    currentPin: string,
    nextPin: string,
    confirmPin: string,
  ): Promise<void>;
  toggleBiometric(enabled: boolean): Promise<void>;
  refreshBiometricAvailability(): Promise<void>;
}

export const useAppLockStore =
  create<AppLockStore>((set, get) => ({
    ready: false,
    unlocked: false,
    config: null,
    biometric: {
      hardware: false,
      enrolled: false,
      strong: false,
      usable: false,
    },
    error: null,
    failedAttempts: 0,

    async bootstrap() {
      try {
        const [config, biometric] =
          await Promise.all([
            loadLockConfig(),
            getBiometricAvailability(),
          ]);

        set({
          ready: true,
          config,
          biometric,
          unlocked: false,
          error: null,
        });
      } catch (error) {
        set({
          ready: true,
          unlocked: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to load app lock settings.',
        });
      }
    },

    async setupPin(
      pin,
      confirmPin,
      enableBiometric,
    ) {
      if (pin !== confirmPin) {
        throw new Error('PIN entries do not match.');
      }

      const config = await createLockConfig(
        pin,
        enableBiometric,
      );

      set({
        config,
        unlocked: true,
        failedAttempts: 0,
        error: null,
      });
    },

    async unlockWithPin(pin) {
      const config = get().config;

      if (!config) {
        set({
          error: 'App lock is not configured.',
        });
        return false;
      }

      const valid = await verifyPin(pin, config);

      if (!valid) {
        set((state) => ({
          failedAttempts:
            state.failedAttempts + 1,
          error: 'Incorrect PIN.',
        }));
        return false;
      }

      set({
        unlocked: true,
        failedAttempts: 0,
        error: null,
      });

      return true;
    },

    async unlockWithBiometric() {
      const config = get().config;

      if (!config?.biometricEnabled) {
        return false;
      }

      const success =
        await authenticateWithBiometrics();

      if (!success) {
        return false;
      }

      set({
        unlocked: true,
        failedAttempts: 0,
        error: null,
      });

      return true;
    },

    async resetPinWithBiometric(
      nextPin,
      confirmPin,
    ) {
      const config = get().config;

      if (!config?.biometricEnabled) {
        throw new Error(
          'Biometric PIN recovery was not enabled for this app.',
        );
      }

      if (nextPin !== confirmPin) {
        throw new Error(
          'PIN entries do not match.',
        );
      }

      const validationError =
        pinValidationMessage(nextPin);

      if (validationError) {
        throw new Error(validationError);
      }

      const confirmed =
        await authenticateWithBiometrics(
          'Verify identity to create a new PIN',
          'Cancel',
        );

      if (!confirmed) {
        throw new Error(
          'Biometric verification was cancelled or unsuccessful.',
        );
      }

      const nextConfig =
        await createLockConfig(
          nextPin,
          config.biometricEnabled,
        );

      set({
        config: nextConfig,
        unlocked: true,
        failedAttempts: 0,
        error: null,
      });
    },

    lock() {
      if (!get().config) {
        return;
      }

      set({
        unlocked: false,
        error: null,
      });
    },

    async updatePin(
      currentPin,
      nextPin,
      confirmPin,
    ) {
      const config = get().config;

      if (!config) {
        throw new Error(
          'App lock is not configured.',
        );
      }

      if (nextPin !== confirmPin) {
        throw new Error('PIN entries do not match.');
      }

      const next = await changePin(
        currentPin,
        nextPin,
        config,
      );

      set({
        config: next,
        error: null,
      });
    },

    async toggleBiometric(enabled) {
      const config = get().config;

      if (!config) {
        throw new Error(
          'App lock is not configured.',
        );
      }

      if (enabled) {
        const confirmed =
          await authenticateWithBiometrics(
            'Confirm biometrics for app unlock',
          );

        if (!confirmed) {
          throw new Error(
            'Biometric confirmation was cancelled.',
          );
        }
      }

      const next = await setBiometricEnabled(
        enabled,
        config,
      );

      const biometric =
        await getBiometricAvailability();

      set({
        config: next,
        biometric,
        error: null,
      });
    },

    async refreshBiometricAvailability() {
      const biometric =
        await getBiometricAvailability();

      set({ biometric });
    },
  }));
