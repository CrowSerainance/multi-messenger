import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import {
  WebView,
} from 'react-native-webview';

import {
  isCallUrl,
  isHttpUrl,
  isInAppUrl,
  isLoginUrl,
  MESSENGER_HOME_URL,
  MESSENGER_USER_AGENT,
} from '../constants/messenger';

import {
  isCurrentJarAuthenticated,
} from '../services/cookieManager';

import {
  useAccountStore,
} from '../store/accountStore';

import {
  buildStorageGuardScript,
  STORAGE_WIPED_MESSAGE,
} from '../services/webStorageIsolation';

interface Props {
  accountId: string;
  epoch: number;
  onExpired(): void;
}

const LOAD_SAVE_THROTTLE_MS =
  30_000;

export function MessengerWebView({
  accountId,
  epoch,
  onExpired,
}: Props) {
  const webViewRef =
    useRef<WebView>(null);

  const canGoBackRef =
    useRef(false);

  const expiredReported =
    useRef(false);

  const lastSaveAt =
    useRef(0);

  const persistActiveSession =
    useAccountStore(
      (state) =>
        state.persistActiveSession,
    );

  // The store persist path also records the
  // account's last successful refresh time.
  // Ownership is still verified by the session
  // coordinator, so a late unmount can never
  // save into the wrong account.
  const persist =
    useCallback(async () => {
      try {
        await persistActiveSession();
      } catch {
        // Native failures are already captured by
        // the redacted session diagnostics service.
        // Background persistence is best-effort.
      }
    }, [persistActiveSession]);

  useEffect(() => {
    const listener = (
      nextState: AppStateStatus,
    ) => {
      if (
        nextState === 'background' ||
        nextState === 'inactive'
      ) {
        void persist();
      }
    };

    const subscription =
      AppState.addEventListener(
        'change',
        listener,
      );

    return () => {
      subscription.remove();
      void persist();
    };
  }, [persist]);

  useEffect(() => {
    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (canGoBackRef.current) {
            webViewRef.current?.goBack();
            return true;
          }

          return false;
        },
      );

    return () => {
      subscription.remove();
    };
  }, []);

  const mediaPermissionsRequested =
    useRef(false);

  const reloadedAfterWipeRef =
    useRef(false);

  // The component instance survives account
  // switches (only the keyed WebView remounts),
  // so the once-per-mount reload guard must be
  // reset whenever a new WebView is mounted.
  useEffect(() => {
    reloadedAfterWipeRef.current = false;
  }, [accountId, epoch]);

  const storageGuardScript =
    useMemo(
      () =>
        buildStorageGuardScript(
          accountId,
        ),
      [accountId],
    );

  // Android runtime camera/microphone
  // permissions are requested lazily, the
  // first time the user opens a call or room,
  // so the app never prompts on plain chat
  // usage. The WebView can only grant a page's
  // capture request when the app itself holds
  // these permissions.
  const ensureMediaPermissions =
    useCallback(async () => {
      if (
        Platform.OS !== 'android' ||
        mediaPermissionsRequested.current
      ) {
        return;
      }

      mediaPermissionsRequested.current =
        true;

      try {
        await PermissionsAndroid.requestMultiple(
          [
            PermissionsAndroid.PERMISSIONS
              .CAMERA,
            PermissionsAndroid.PERMISSIONS
              .RECORD_AUDIO,
          ],
        );
      } catch {
        // Denied permissions surface inside the
        // page; the user can grant them later
        // from system settings.
      }
    }, []);

  const persistAfterLoad =
    useCallback(() => {
      const now = Date.now();

      if (
        now - lastSaveAt.current <
        LOAD_SAVE_THROTTLE_MS
      ) {
        return;
      }

      lastSaveAt.current = now;
      void persist();
    }, [persist]);

  const detectExpiredSession =
    useCallback(
      async (url: string) => {
        if (
          expiredReported.current ||
          !isLoginUrl(url)
        ) {
          return;
        }

        await new Promise<void>(
          (resolve) => {
            setTimeout(resolve, 700);
          },
        );

        let stillAuthenticated: boolean;

        try {
          stillAuthenticated =
            await isCurrentJarAuthenticated();
        } catch {
          // A native cookie read failure is not
          // evidence that the account expired.
          return;
        }

        if (
          !stillAuthenticated &&
          !expiredReported.current
        ) {
          expiredReported.current =
            true;

          onExpired();
        }
      },
      [onExpired],
    );

  return (
    <WebView
      ref={webViewRef}
      key={`${accountId}:${epoch}`}
      style={styles.webview}
      source={{
        uri: MESSENGER_HOME_URL,
      }}
      userAgent={
        MESSENGER_USER_AGENT
      }
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      javaScriptEnabled
      pullToRefreshEnabled
      allowsBackForwardNavigationGestures
      injectedJavaScriptBeforeContentLoaded={
        storageGuardScript
      }
      onMessage={(event) => {
        // After a cross-account wipe, reload
        // once so the page restarts against the
        // cleaned storage profile (and any
        // unregistered service worker is gone).
        if (
          event.nativeEvent.data ===
            STORAGE_WIPED_MESSAGE &&
          !reloadedAfterWipeRef.current
        ) {
          reloadedAfterWipeRef.current =
            true;

          webViewRef.current?.reload();
        }
      }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={
        false
      }
      mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
      onFileDownload={({
        nativeEvent,
      }) => {
        // iOS WKWebView cannot download
        // directly; hand the file URL to the
        // system so Safari/Files handles it.
        Linking.openURL(
          nativeEvent.downloadUrl,
        ).catch(() => {
          // Nothing can handle the URL.
        });
      }}
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
          />
        </View>
      )}
      onShouldStartLoadWithRequest={(
        request,
      ) => {
        // Sub-frame loads (embeds, captchas)
        // must not be redirected out of the app.
        if (
          request.isTopFrame === false
        ) {
          return true;
        }

        const url = request.url;

        if (
          url === 'about:blank' ||
          isInAppUrl(url)
        ) {
          return true;
        }

        // Shared links open in the system
        // browser; custom schemes such as
        // fb:// or intent:// are dropped so
        // they cannot crash the WebView.
        if (isHttpUrl(url)) {
          Linking.openURL(url).catch(
            () => {
              // Nothing can handle the URL.
            },
          );
        }

        return false;
      }}
      onLoadEnd={(event) => {
        const url =
          event.nativeEvent.url;

        persistAfterLoad();

        void detectExpiredSession(
          url,
        );
      }}
      onNavigationStateChange={(
        navState,
      ) => {
        canGoBackRef.current =
          navState.canGoBack;

        if (isCallUrl(navState.url)) {
          void ensureMediaPermissions();
        }

        void detectExpiredSession(
          navState.url,
        );
      }}
    />
  );
}

const styles =
  StyleSheet.create({
    webview: {
      flex: 1,
    },

    loading: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'white',
    },
  });
