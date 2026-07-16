import React, {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import {
  AppState,
  type AppStateStatus,
  StyleSheet,
} from 'react-native';

import {
  WebView,
} from 'react-native-webview';

import {
  isLoginUrl,
  MESSENGER_HOME_URL,
  MOBILE_USER_AGENT,
} from '../constants/messenger';

import {
  isCurrentJarAuthenticated,
} from '../services/cookieManager';

import {
  persistOwnedSession,
} from '../services/sessionCoordinator';

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
  const expiredReported =
    useRef(false);

  const lastSaveAt =
    useRef(0);

  const persist =
    useCallback(async () => {
      await persistOwnedSession(
        accountId,
      );
    }, [accountId]);

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

        const stillAuthenticated =
          await isCurrentJarAuthenticated();

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
      key={`${accountId}:${epoch}`}
      style={styles.webview}
      source={{
        uri: MESSENGER_HOME_URL,
      }}
      userAgent={
        MOBILE_USER_AGENT
      }
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      javaScriptEnabled
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
  });
