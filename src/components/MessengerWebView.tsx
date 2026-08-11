import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  resolveSessionMode,
} from '../services/profileBackend';

import {
  isIsolatedSessionAuthenticated,
} from '../services/profileCoordinator';

import {
  useAccountStore,
} from '../store/accountStore';

import {
  buildStorageGuardScript,
  STORAGE_WIPED_MESSAGE,
} from '../services/webStorageIsolation';

import {
  useThemedStyles,
  type ThemeColors,
} from '../ui/theme';

interface Props {
  accountId: string;
  epoch: number;
  /**
   * False for warm-but-hidden sessions in multi-live mode. An
   * inactive WebView must not consume back presses, persist the
   * session (the store persists the *active* account), report
   * expiry into the router, or keep media playing.
   */
  isActive?: boolean;
  onExpired(): void;
  /** Fires once the native WebView instance exists. */
  onNativeCreated?(): void;
  /** Fires on the first completed load of this session. */
  onReady?(): void;
  /**
   * True while this session is in a transaction that must not be
   * interrupted by eviction: a call, or an in-flight attachment
   * upload. Receives the account id so the container can pass one
   * stable callback to every layer.
   */
  onBusyChange?(
    accountId: string,
    busy: boolean,
  ): void;
  /** The WebView's renderer process died; this layer is dead. */
  onRendererGone?(accountId: string): void;
}

const LOAD_SAVE_THROTTLE_MS =
  30_000;

const UPLOAD_ACTIVE_MESSAGE =
  'MMW_UPLOAD_ACTIVE';

const UPLOAD_IDLE_MESSAGE =
  'MMW_UPLOAD_IDLE';

/**
 * Upload detection is a heuristic: react-native-webview exposes no
 * cross-platform file-chooser or upload-progress event, so the page
 * itself reports when a file input is used. The in-page ceiling
 * releases the flag even if the upload never reports completion, so
 * a stuck page cannot pin a warm session forever.
 */
const UPLOAD_WATCH_SCRIPT = `
(function () {
  if (window.__mmwUploadHooks) {
    return true;
  }

  window.__mmwUploadHooks = true;

  var timer = null;

  function post(message) {
    try {
      window.ReactNativeWebView.postMessage(message);
    } catch (error) {}
  }

  function idle() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    post('${UPLOAD_IDLE_MESSAGE}');
  }

  function active() {
    if (timer !== null) {
      clearTimeout(timer);
    }

    post('${UPLOAD_ACTIVE_MESSAGE}');
    timer = setTimeout(idle, 120000);
  }

  function isFileInput(node) {
    return !!node &&
      node.tagName === 'INPUT' &&
      node.type === 'file';
  }

  document.addEventListener('click', function (event) {
    if (isFileInput(event.target)) {
      active();
    }
  }, true);

  document.addEventListener('change', function (event) {
    if (isFileInput(event.target)) {
      active();
    }
  }, true);

  window.addEventListener('beforeunload', idle);

  true;
})();
`;

// Hidden sessions keep their sockets and DOM, but audio or video
// must not keep playing behind another account's chat.
const PAUSE_MEDIA_SCRIPT = `
(function () {
  try {
    var media = document.querySelectorAll('video, audio');
    for (var index = 0; index < media.length; index += 1) {
      try {
        media[index].pause();
      } catch (error) {}
    }
  } catch (error) {}
  true;
})();
`;

export function MessengerWebView({
  accountId,
  epoch,
  isActive = true,
  onExpired,
  onNativeCreated,
  onReady,
  onBusyChange,
  onRendererGone,
}: Props) {
  const styles = useThemedStyles(makeStyles);

  const [inCall, setInCall] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const webViewRef =
    useRef<WebView | null>(null);

  const canGoBackRef =
    useRef(false);

  const expiredReported =
    useRef(false);

  const lastSaveAt =
    useRef(0);

  const nativeCreatedRef =
    useRef(false);

  const readyReportedRef =
    useRef(false);

  const isActiveRef =
    useRef(isActive);

  const persistActiveSession =
    useAccountStore(
      (state) =>
        state.persistActiveSession,
    );

  const profileId =
    useAccountStore(
      (state) =>
        state.accounts.find(
          (account) =>
            account.id === accountId,
        )?.profileId,
    );

  // Effects read activity through a ref so listeners registered
  // once still see the current visibility.
  useEffect(() => {
    isActiveRef.current = isActive;

    if (!isActive) {
      webViewRef.current?.injectJavaScript(
        PAUSE_MEDIA_SCRIPT,
      );
    }
  }, [isActive]);

  // A call or an in-flight upload marks the session busy so LRU
  // eviction skips it while the user reads another account.
  useEffect(() => {
    onBusyChange?.(
      accountId,
      inCall || uploading,
    );
  }, [
    accountId,
    inCall,
    uploading,
    onBusyChange,
  ]);

  useEffect(
    () => () => {
      // An unmounted session cannot be busy.
      onBusyChange?.(accountId, false);
    },
    [accountId, onBusyChange],
  );

  // The store persist path also records the
  // account's last successful refresh time.
  // Ownership is still verified by the session
  // coordinator, so a late unmount can never
  // save into the wrong account.
  const persist =
    useCallback(async () => {
      if (!isActiveRef.current) {
        // Only the visible session owns the persist path.
        return;
      }

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
          // Hidden sessions must not swallow the
          // back press of the visible one.
          if (!isActiveRef.current) {
            return false;
          }

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
          // Isolated accounts authenticate against
          // their own profile jar, not the shared one.
          stillAuthenticated =
            profileId &&
            (await resolveSessionMode()) ===
              'isolated'
              ? await isIsolatedSessionAuthenticated(
                  profileId,
                )
              : await isCurrentJarAuthenticated();
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

          // Routing a hidden session to the login screen
          // would hijack the account the user is reading.
          // The next switch re-runs this check.
          if (isActiveRef.current) {
            onExpired();
          } else {
            expiredReported.current = false;
          }
        }
      },
      [onExpired, profileId],
    );

  const attachRef =
    useCallback(
      (instance: WebView | null) => {
        webViewRef.current = instance;

        // The native instance exists by the time React
        // attaches the ref, so the profile slot taken for
        // this mount can be handed to the next one.
        if (
          instance &&
          !nativeCreatedRef.current
        ) {
          nativeCreatedRef.current = true;
          onNativeCreated?.();
        }
      },
      [onNativeCreated],
    );

  return (
    <WebView
      ref={attachRef}
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
        // Native profiles already isolate storage.
        // The legacy in-page wipe/reload guard causes
        // empty-state loading loops after a profile
        // remount and must stay off in isolated mode.
        profileId
          ? undefined
          : storageGuardScript
      }
      injectedJavaScript={
        UPLOAD_WATCH_SCRIPT
      }
      onRenderProcessGone={() => {
        // Android killed this WebView's renderer. The layer is
        // dead: it can neither render nor recover on its own.
        onRendererGone?.(accountId);
      }}
      onContentProcessDidTerminate={() => {
        onRendererGone?.(accountId);
      }}
      onMessage={(event) => {
        const message =
          event.nativeEvent.data;

        if (
          message === UPLOAD_ACTIVE_MESSAGE
        ) {
          setUploading(true);
          return;
        }

        if (message === UPLOAD_IDLE_MESSAGE) {
          setUploading(false);
          return;
        }

        if (profileId) {
          return;
        }

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
          // A hidden session must never pull the user
          // out of the app on its own.
          if (!isActiveRef.current) {
            return false;
          }

          if (__DEV__) {
            // Host only: full URLs carry tokens.
            console.log(
              'EXTERNAL_OPEN',
              /^https?:\/\/([^/:?#]+)/i.exec(
                url,
              )?.[1] ?? 'unknown',
            );
          }

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

        if (!readyReportedRef.current) {
          readyReportedRef.current = true;
          onReady?.();
        }

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

        const onCall = isCallUrl(
          navState.url,
        );

        setInCall(onCall);

        if (
          onCall &&
          isActiveRef.current
        ) {
          void ensureMediaPermissions();
        }

        void detectExpiredSession(
          navState.url,
        );
      }}
    />
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
    webview: {
      flex: 1,
      backgroundColor: colors.background,
    },

    loading: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
  });
