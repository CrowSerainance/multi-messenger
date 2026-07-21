import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  WebView,
} from 'react-native-webview';

import {
  isHttpUrl,
  LOGIN_USER_AGENT,
  MESSENGER_LOGIN_URL,
} from '../constants/messenger';

import {
  isCurrentJarAuthenticated,
} from '../services/cookieManager';

import {
  beginFreshLoginSession,
} from '../services/sessionCoordinator';

import {
  type LoginCancellationDestination,
  useAccountStore,
} from '../store/accountStore';

import {
  NameAccountModal,
} from '../components/NameAccountModal';

import {
  AppButton,
} from '../ui/AppButton';

import {
  ScreenHeader,
} from '../ui/ScreenHeader';

import {
  colors,
  space,
} from '../ui/theme';

import {
  buildStorageClaimScript,
  buildStorageGuardScript,
  LOGIN_STORAGE_OWNER,
} from '../services/webStorageIsolation';

// Wipes the previous owner's web storage as
// soon as the login page loads, so a new login
// never sees another account's site data.
const LOGIN_STORAGE_GUARD =
  buildStorageGuardScript(
    LOGIN_STORAGE_OWNER,
  );

interface Props {
  reauthAccountId?: string;
  onComplete(): void;
  onCancel(
    destination: LoginCancellationDestination,
  ): void;
}

type CancellationState =
  | 'idle'
  | 'cancelling'
  | 'failed';

export function LoginScreen({
  reauthAccountId,
  onComplete,
  onCancel,
}: Props) {
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

  const cancelLogin =
    useAccountStore(
      (state) =>
        state.cancelLogin,
    );

  const [ready, setReady] =
    useState(false);

  const [
    showNameModal,
    setShowNameModal,
  ] = useState(false);

  const [busy, setBusy] =
    useState(false);

  const [
    cancellationState,
    setCancellationState,
  ] = useState<CancellationState>(
    'idle',
  );

  const [error, setError] =
    useState<string | null>(null);

  const authHandledRef =
    useRef(false);

  const authCheckInFlightRef =
    useRef(false);

  const authCheckPendingRef =
    useRef(false);

  const cancellingRef =
    useRef(false);

  const webViewRef =
    useRef<WebView>(null);

  // Stamps the freshly created login storage
  // with its new owner so the Messenger WebView
  // does not immediately wipe it again. If the
  // injection is lost to unmount timing, the
  // fallback is one redundant storage wipe on
  // first mount — never a leak.
  const claimStorageForAccount =
    (accountId: string) => {
      webViewRef.current?.injectJavaScript(
        buildStorageClaimScript(
          accountId,
        ),
      );
    };

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
      if (
        authHandledRef.current ||
        cancellingRef.current
      ) {
        return;
      }

      if (authCheckInFlightRef.current) {
        authCheckPendingRef.current = true;
        return;
      }

      authCheckInFlightRef.current = true;

      try {
        do {
          authCheckPendingRef.current =
            false;

          const authenticated =
            await isCurrentJarAuthenticated();

          if (cancellingRef.current) {
            return;
          }

          if (!authenticated) {
            continue;
          }

          setError(null);

          authHandledRef.current = true;

          if (reauthAccountId) {
            try {
              setBusy(true);

              await replaceAccountFromLogin(
                reauthAccountId,
              );

              claimStorageForAccount(
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
          return;
        } while (
          authCheckPendingRef.current
        );
      } catch (caught) {
        if (!cancellingRef.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to verify the login session.',
          );
        }
      } finally {
        authCheckInFlightRef.current =
          false;
      }
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

        const accountId =
          await createAccountFromLogin(
            name,
          );

        claimStorageForAccount(
          accountId,
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
    if (
      cancellingRef.current ||
      busy
    ) {
      return;
    }

    cancellingRef.current = true;
    authHandledRef.current = true;
    setCancellationState(
      'cancelling',
    );
    setError(null);

    try {
      const destination =
        await cancelLogin();

      onCancel(destination);
    } catch (caught) {
      cancellingRef.current = false;
      authHandledRef.current = false;
      setCancellationState('failed');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to restore the previous account.',
      );
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

            <AppButton
              title="Go Back"
              onPress={() => {
                void cancel();
              }}
            />
          </>
        ) : (
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={
          reauthAccountId
            ? 'Sign in again'
            : 'Add Account'
        }
        subtitle="Messenger login"
        onBack={() => {
          void cancel();
        }}
        backLabel="Cancel"
      />

      {error && (
        <Text style={styles.errorBanner}>
          {error}
        </Text>
      )}

      <WebView
        ref={webViewRef}
        source={{
          uri: MESSENGER_LOGIN_URL,
        }}
        userAgent={
          LOGIN_USER_AGENT
        }
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={
          LOGIN_STORAGE_GUARD
        }
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
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

      {(busy ||
        cancellationState ===
          'cancelling') && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          {cancellationState ===
            'cancelling' && (
            <Text style={styles.busyText}>
              Restoring previous account…
            </Text>
          )}
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
      backgroundColor: colors.background,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.lg,
      padding: space.xl,
      backgroundColor: colors.background,
    },

    error: {
      paddingHorizontal: space.lg,
      color: colors.danger,
      textAlign: 'center',
      lineHeight: 21,
    },

    errorBanner: {
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      backgroundColor: colors.dangerSoft,
      color: colors.danger,
    },

    busyOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        'rgba(255,255,255,0.78)',
      justifyContent: 'center',
      alignItems: 'center',
      gap: space.md,
    },

    busyText: {
      color: colors.text,
      fontWeight: '600',
    },
  });
