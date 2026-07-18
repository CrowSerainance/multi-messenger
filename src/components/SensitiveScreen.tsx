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
  enableAppSwitcherProtectionAsync,
  usePreventScreenCapture,
} from 'expo-screen-capture';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  captureKey?: string;
}

/**
 * Blocks screenshots/recordings on Android via
 * FLAG_SECURE and on supported iOS versions.
 * Also blurs iOS app-switcher previews.
 */
export function SensitiveScreen({
  children,
  style,
  captureKey = 'messenger-sensitive',
}: Props) {
  usePreventScreenCapture(captureKey);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    void enableAppSwitcherProtectionAsync(0.7);
  }, []);

  return (
    <View style={[{ flex: 1 }, style]}>
      {children}
    </View>
  );
}
