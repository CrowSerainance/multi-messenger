import React, {
  useEffect,
} from 'react';

import {
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';

import {
  usePreferencesStore,
} from '../store/preferencesStore';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  captureKey?: string;
}

/**
 * Applies the user's screenshot preference.
 *
 * When capture is not allowed this blocks screenshots and
 * recordings via Android FLAG_SECURE (and the supported iOS
 * equivalent) and blurs the iOS app-switcher preview. When the user
 * has allowed screenshots the protection is released instead, which
 * also un-blanks the recents thumbnail.
 *
 * expo-screen-capture reference-counts by key, so several mounted
 * screens can hold their own protection independently.
 */
export function SensitiveScreen({
  children,
  style,
  captureKey = 'messenger-sensitive',
}: Props) {
  const allowScreenCapture =
    usePreferencesStore(
      (state) => state.allowScreenCapture,
    );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (allowScreenCapture) {
          await allowScreenCaptureAsync(
            captureKey,
          );
        } else {
          await preventScreenCaptureAsync(
            captureKey,
          );
        }
      } catch {
        // Losing the native call must not take the screen down;
        // the worst case is that the previous protection state
        // persists until the next toggle.
      }
    })();

    return () => {
      if (cancelled) {
        return;
      }

      cancelled = true;

      void (async () => {
        try {
          await allowScreenCaptureAsync(
            captureKey,
          );
        } catch {
          // Nothing left to do on unmount.
        }
      })();
    };
  }, [allowScreenCapture, captureKey]);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    void (async () => {
      try {
        if (allowScreenCapture) {
          await disableAppSwitcherProtectionAsync();
        } else {
          await enableAppSwitcherProtectionAsync(
            0.7,
          );
        }
      } catch {
        // iOS-only nicety; not worth surfacing.
      }
    })();
  }, [allowScreenCapture]);

  return (
    <View style={[{ flex: 1 }, style]}>
      {children}
    </View>
  );
}
