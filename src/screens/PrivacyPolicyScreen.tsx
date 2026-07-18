import React from 'react';

import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SensitiveScreen,
} from '../components/SensitiveScreen';

interface Props {
  onBack(): void;
}

export function PrivacyPolicyScreen({
  onBack,
}: Props) {
  return (
    <SensitiveScreen
      style={styles.container}
      captureKey="privacy"
    >
      <View style={styles.toolbar}>
        <Button
          title="Back"
          onPress={onBack}
        />

        <Text style={styles.title}>
          Privacy
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
      >
        <Text style={styles.heading}>
          Messenger Sessions privacy notice
        </Text>

        <Text style={styles.body}>
          This app stores Facebook/Messenger
          session cookies only on this device
          using encrypted SecureStore. Cookie
          values are never written to
          AsyncStorage, never printed to logs,
          and are never sent to a remote
          analytics or backend service by this
          app.
        </Text>

        <Text style={styles.body}>
          An app PIN is required before saved
          sessions can be read. Optional
          biometric unlock is a convenience
          layer for that same local unlock step.
          Screenshots are blocked on sensitive
          screens.
        </Text>

        <Text style={styles.body}>
          Cookie snapshots are excluded from
          Android Auto Backup / cloud backup
          through the Expo SecureStore backup
          configuration. Deleting an account
          deletes its stored cookie snapshot
          from this device.
        </Text>

        <Text style={styles.body}>
          Messenger itself is operated by Meta.
          Your use of Messenger remains subject
          to Meta’s terms and privacy policy.
          This notice covers only the local
          multi-account wrapper on your device.
        </Text>

        <Text style={styles.note}>
          Expand this notice with jurisdiction-
          specific legal language before any
          public distribution.
        </Text>
      </ScrollView>
    </SensitiveScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    backgroundColor: 'white',
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  title: {
    fontSize: 20,
    fontWeight: '800',
  },

  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },

  heading: {
    fontSize: 22,
    fontWeight: '800',
  },

  body: {
    color: '#333',
    lineHeight: 22,
    fontSize: 15,
  },

  note: {
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
