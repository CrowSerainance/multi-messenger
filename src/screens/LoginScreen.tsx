import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  WebView,
} from 'react-native-webview';

import {
  isHttpUrl,
  MESSENGER_LOGIN_URL,
  MOBILE_USER_AGENT,
} from '../constants/messenger';

import {
  isCurrentJarAuthenticated,
} from '../services/cookieManager';

import {
  abandonLoginSession,
  beginFreshLoginSession,
} from '../services/sessionCoordinator';

import {
  useAccountStore,
} from '../store/accountStore';

import {
  NameAccountModal,
} from '../components/NameAccountModal';

interface Props {
  reauthAccountId?: string;
  onComplete(): void;
  onCancel(): void;
}

export function LoginScreen({
  reauthAccountId,
  onComplete,
  onCancel,
}: Props) {
  const activeAccountId =
    useAccountStore(
      (state) =>
        state.activeAccountId,
    );

  const createAccountFromLogin =
    useAccountStore(
      (state) =>
        state.createAccountFromLogin,
    );

  const replaceAccountFromLogin =
    useAccountStore(
      (state) =>
        state.replaceAccountFromLogin,
    );

  const switchAccount =
    useAccountStore(
      (state) =>
        state.switchAccount,
    );

  const [ready, setReady] =
    useState(false);

  const [
    showNameModal,
    setShowNameModal,
  ] = useState(false);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const authHandledRef =
    useRef(false);

  useEffect(() => {
    let mounted = true;

    beginFreshLoginSession()
      .then(() => {
        if (mounted) {
          setReady(true);
        }
      })
      .catch((caught) => {
        if (!mounted) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to start login session.',
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const detectLogin =
    useCallback(async () => {
      if (authHandledRef.current) {
        return;
      }

      const authenticated =
        await isCurrentJarAuthenticated();

      if (!authenticated) {
        return;
      }

      authHandledRef.current = true;

      if (reauthAccountId) {
        try {
          setBusy(true);

          await replaceAccountFromLogin(
            reauthAccountId,
          );

          onComplete();
        } catch (caught) {
          authHandledRef.current =
            false;

          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to save refreshed session.',
          );
        } finally {
          setBusy(false);
        }

        return;
      }

      setShowNameModal(true);
    }, [
      onComplete,
      reauthAccountId,
      replaceAccountFromLogin,
    ]);

  const saveNewAccount =
    async (name: string) => {
      try {
        setBusy(true);
        setError(null);

        await createAccountFromLogin(
          name,
        );

        setShowNameModal(false);
        onComplete();
      } catch (caught) {
        authHandledRef.current =
          false;

        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to save account.',
        );
      } finally {
        setBusy(false);
      }
    };

  const cancel = async () => {
    try {
      if (activeAccountId) {
        await switchAccount(
          activeAccountId,
        );
      } else {
        await abandonLoginSession();
      }
    } catch {
      // The previous session could not be
      // restored; leaving the screen is still
      // the right move, and the jar will be
      // reset by the next login or switch.
    } finally {
      onCancel();
    }
  };

  const cancelFromModal = () => {
    setShowNameModal(false);
    void cancel();
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.error}>
              {error}
            </Text>

            <Button
              title="Go Back"
              onPress={() => {
                void cancel();
              }}
            />
          </>
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button
          title="Cancel"
          onPress={cancel}
          disabled={busy}
        />

        <Text style={styles.title}>
          {reauthAccountId
            ? 'Sign in again'
            : 'Add Messenger Account'}
        </Text>
      </View>

      {error && (
        <Text style={styles.errorBanner}>
          {error}
        </Text>
      )}

      <WebView
        source={{
          uri: MESSENGER_LOGIN_URL,
        }}
        userAgent={
          MOBILE_USER_AGENT
        }
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator
              size="large"
            />
          </View>
        )}
        onShouldStartLoadWithRequest={(
          request,
        ) => {
          if (
            request.isTopFrame === false
          ) {
            return true;
          }

          // Block custom schemes such as
          // fb:// or intent:// that would
          // otherwise crash the WebView.
          return (
            request.url ===
              'about:blank' ||
            isHttpUrl(request.url)
          );
        }}
        onLoadEnd={() => {
          void detectLogin();
        }}
        onNavigationStateChange={() => {
          void detectLogin();
        }}
      />

      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator
            size="large"
          />
        </View>
      )}

      <NameAccountModal
        visible={showNameModal}
        busy={busy}
        onSubmit={(name) => {
          void saveNewAccount(name);
        }}
        onCancel={cancelFromModal}
      />
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },

    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 8,
    },

    title: {
      fontSize: 17,
      fontWeight: '700',
    },

    error: {
      padding: 16,
      color: '#b00020',
    },

    errorBanner: {
      padding: 10,
      backgroundColor: '#fee',
      color: '#900',
    },

    busyOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        'rgba(255,255,255,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
