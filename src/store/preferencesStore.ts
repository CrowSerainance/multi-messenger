import { create } from 'zustand';

import {
  secureReadJson,
  secureWriteJson,
} from '../services/secureJson';

/**
 * Local, non-secret app preferences.
 *
 * Kept out of `messenger.app.lock.v1`: that record has security
 * semantics (an absent lock means first-time setup, and the
 * forgotten-PIN recovery path depends on its exact shape), so a
 * cosmetic setting must not be able to corrupt it.
 */

const PREFERENCES_KEY =
  'messenger.preferences.v1';

interface Preferences {
  /**
   * When true, Android FLAG_SECURE is not applied, so the user can
   * take screenshots. This also un-blanks the recents/app-switcher
   * thumbnail and permits screen recording — see SecuritySettings
   * for the copy the user is shown.
   */
  allowScreenCapture: boolean;
}

const DEFAULTS: Preferences = {
  // Owner request (2026-08-08): screenshots are allowed by default.
  allowScreenCapture: true,
};

interface PreferencesStore extends Preferences {
  ready: boolean;

  bootstrap(): Promise<void>;

  setAllowScreenCapture(
    next: boolean,
  ): Promise<void>;
}

function sanitize(
  saved: Partial<Preferences> | null,
): Preferences {
  if (!saved) {
    return DEFAULTS;
  }

  return {
    allowScreenCapture:
      typeof saved.allowScreenCapture === 'boolean'
        ? saved.allowScreenCapture
        : DEFAULTS.allowScreenCapture,
  };
}

export const usePreferencesStore =
  create<PreferencesStore>((set, get) => ({
    ...DEFAULTS,
    ready: false,

    async bootstrap() {
      try {
        const saved =
          await secureReadJson<
            Partial<Preferences>
          >(PREFERENCES_KEY);

        set({
          ...sanitize(saved),
          ready: true,
        });
      } catch {
        // A corrupt or unreadable record must not block the app;
        // fall back to defaults.
        set({
          ...DEFAULTS,
          ready: true,
        });
      }
    },

    async setAllowScreenCapture(next) {
      const previous = get().allowScreenCapture;

      set({ allowScreenCapture: next });

      try {
        await secureWriteJson(
          PREFERENCES_KEY,
          {
            allowScreenCapture: next,
          } satisfies Preferences,
        );
      } catch (error) {
        // Keep the UI honest: a setting that was not persisted
        // must not look persisted.
        set({ allowScreenCapture: previous });
        throw error;
      }
    },
  }));
