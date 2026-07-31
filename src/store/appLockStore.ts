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

/**
 * How long a backgrounded session may be resumed
 * without re-entering the PIN.
 *
 * Locking on every background transition made the
 * app demand a PIN constantly during normal use —
 * a permission dialog, an external link, or a brief
 * app switch each forced a full re-entry. The lock
 * still engages immediately (so the app is locked
 * while backgrounded, and the app-switcher preview
 * stays protected by FLAG_SECURE); this only allows
 * a silent resume when the user returns quickly.
 *
 * `lockedAt` lives in memory only, so a killed or
 * restarted process always requires the PIN.
 */
export const LOCK_GRACE_MS = 120_000;

interface AppLockStore {
  ready: boolean;
  unlocked: boolean;
  config: AppLockConfig | null;
  biometric: BiometricAvailability;
  error: string | null;
  failedAttempts: number;
  /** Epoch ms of the last background-triggered lock. */
  lockedAt: number | null;

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
  /**
   * Silently restores an in-memory lock if the user
   * returned within the grace window. Returns true
   * when the session was resumed.
   */
  resumeIfWithinGrace(): boolean;
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
    lockedAt: null,

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
          lockedAt: null,
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
        lockedAt: null,
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
        lockedAt: null,
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
        lockedAt: null,
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
        lockedAt: null,
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
        lockedAt: Date.now(),
        error: null,
      });
    },

    resumeIfWithinGrace() {
      const {
        config,
        unlocked,
        lockedAt,
      } = get();

      if (
        !config ||
        unlocked ||
        lockedAt === null
      ) {
        return false;
      }

      if (
        Date.now() - lockedAt >
        LOCK_GRACE_MS
      ) {
        // Too long; require the PIN and stop
        // offering a silent resume.
        set({ lockedAt: null });
        return false;
      }

      set({
        unlocked: true,
        lockedAt: null,
        failedAttempts: 0,
        error: null,
      });

      return true;
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
