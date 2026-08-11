import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import {
  SensitiveScreen,
} from './src/components/SensitiveScreen';

import {
  useThemeColors,
  useThemeName,
  useThemedStyles,
  type ThemeColors,
} from './src/ui/theme';

import {
  HomeScreen,
} from './src/screens/HomeScreen';

import {
  LoginScreen,
} from './src/screens/LoginScreen';

import {
  ManageAccountsScreen,
} from './src/screens/ManageAccountsScreen';

import {
  MessengerScreen,
} from './src/screens/MessengerScreen';

import {
  PrivacyPolicyScreen,
} from './src/screens/PrivacyPolicyScreen';

import {
  SecuritySettingsScreen,
} from './src/screens/SecuritySettingsScreen';

import {
  SessionDiagnosticsScreen,
} from './src/screens/SessionDiagnosticsScreen';

import {
  SetupPinScreen,
} from './src/screens/SetupPinScreen';

import {
  UnlockScreen,
} from './src/screens/UnlockScreen';

import {
  SessionExpiredError,
} from './src/services/cookieManager';

import {
  useAccountStore,
} from './src/store/accountStore';

import {
  useAppLockStore,
} from './src/store/appLockStore';

import {
  usePreferencesStore,
} from './src/store/preferencesStore';

import {
  getWebViewProfileCapabilityForDiagnostics,
  resolveSessionMode,
  runWebViewProfileSelfTest,
} from './src/services/profileBackend';

import {
  isMultiLiveEnabled,
} from './src/constants/features';

type Route =
  | {
      name: 'home';
    }
  | {
      name: 'messenger';
    }
  | {
      name: 'diagnostics';
    }
  | {
      name: 'manage';
    }
  | {
      name: 'security';
      from: 'home' | 'manage';
    }
  | {
      name: 'privacy';
      from:
        | 'security-home'
        | 'security-manage'
        | 'manage'
        | 'home';
    }
  | {
      name: 'login';
      reauthAccountId?: string;
    };

export default function App() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  // System appearance drives the chrome: a light status bar over
  // the dark palette is unreadable.
  const barStyle =
    useThemeName() === 'dark'
      ? ('light-content' as const)
      : ('dark-content' as const);

  const [route, setRoute] =
    useState<Route>({
      name: 'home',
    });

  const [resuming, setResuming] =
    useState(false);

  // Multi-live needs the flag *and* a device whose WebView
  // provider supports isolated profiles. Anything else keeps the
  // single-WebView path.
  const [multiLive, setMultiLive] =
    useState(false);

  const didResumeRef = useRef(false);

  const lockReady =
    useAppLockStore(
      (state) => state.ready,
    );

  const unlocked =
    useAppLockStore(
      (state) => state.unlocked,
    );

  const lockConfig =
    useAppLockStore(
      (state) => state.config,
    );

  const bootstrapLock =
    useAppLockStore(
      (state) => state.bootstrap,
    );

  const lockApp =
    useAppLockStore(
      (state) => state.lock,
    );

  const hydrated =
    useAccountStore(
      (state) =>
        state.hydrated,
    );

  const hydrate =
    useAccountStore(
      (state) =>
        state.hydrate,
    );

  const switchAccount =
    useAccountStore(
      (state) =>
        state.switchAccount,
    );

  const persistActiveSession =
    useAccountStore(
      (state) =>
        state.persistActiveSession,
    );

  const bootstrapPreferences =
    usePreferencesStore(
      (state) => state.bootstrap,
    );

  useEffect(() => {
    void bootstrapLock();
  }, [bootstrapLock]);

  // Screenshot policy is a plain local preference, so it loads
  // independently of the PIN gate.
  useEffect(() => {
    void bootstrapPreferences();
  }, [bootstrapPreferences]);

  useEffect(() => {
    if (!isMultiLiveEnabled()) {
      return;
    }

    let mounted = true;

    void resolveSessionMode().then((mode) => {
      if (mounted && mode === 'isolated') {
        setMultiLive(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // ML-0 capability spike: development-only. Records the
  // real AndroidX WebKit MULTI_PROFILE result and runs the
  // profile isolation self-test on the actual device/
  // provider. Logs redacted booleans/versions only (no
  // session data) and never runs in a release build.
  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    void (async () => {
      try {
        console.log('ML0_PROBE_START');

        const capability =
          await getWebViewProfileCapabilityForDiagnostics();
        console.log(
          'ML0_PROFILE_CAPABILITY',
          JSON.stringify(capability),
        );

        const selfTest =
          await runWebViewProfileSelfTest();
        console.log(
          'ML0_PROFILE_SELFTEST',
          JSON.stringify(selfTest),
        );
      } catch (error) {
        console.log(
          'ML0_PROBE_ERROR',
          error instanceof Error
            ? error.message
            : String(error),
        );
      }
    })();
  }, []);

  // Sessions stay unread until the app is unlocked.
  useEffect(() => {
    if (!unlocked || hydrated) {
      return;
    }

    void hydrate();
  }, [unlocked, hydrated, hydrate]);

  // Resume the preferred account once after the
  // first successful unlock + hydrate.
  useEffect(() => {
    if (!unlocked || !hydrated) {
      return;
    }

    if (didResumeRef.current) {
      return;
    }

    didResumeRef.current = true;

    const storeState =
      useAccountStore.getState();

    const lastActiveId =
      storeState.defaultAccountId ??
      storeState.activeAccountId;

    if (!lastActiveId) {
      setResuming(false);
      return;
    }

    setResuming(true);

    switchAccount(lastActiveId)
      .then(() => {
        setRoute({
          name: 'messenger',
        });
      })
      .catch((error) => {
        if (
          error instanceof
          SessionExpiredError
        ) {
          setRoute({
            name: 'login',
            reauthAccountId:
              lastActiveId,
          });
        }
      })
      .finally(() => {
        setResuming(false);
      });
  }, [unlocked, hydrated, switchAccount]);

  // Relock when the app fully backgrounds so
  // returning requires PIN/biometric.
  // Use background only (not inactive) to avoid
  // locking during the biometric system sheet.
  //
  // Returning within LOCK_GRACE_MS resumes
  // silently, so a permission dialog, an external
  // link, or a brief app switch does not force a
  // PIN re-entry mid-session.
  //
  // Never lock while an account switch is in
  // flight: the WebView remount is heavy and some
  // devices briefly report `background` under
  // memory pressure. Locking then unmounted the
  // Messenger tree and made every swap feel like
  // a cold PIN + empty history reload.
  useEffect(() => {
    const onChange = (
      nextState: AppStateStatus,
    ) => {
      if (__DEV__) {
        console.log(
          'APPSTATE',
          nextState,
        );
      }

      if (nextState === 'active') {
        const resumed =
          useAppLockStore
            .getState()
            .resumeIfWithinGrace();

        if (__DEV__) {
          console.log(
            'APPLOCK resume',
            JSON.stringify({
              resumed,
              unlocked:
                useAppLockStore.getState()
                  .unlocked,
            }),
          );
        }

        return;
      }

      if (nextState !== 'background') {
        return;
      }

      if (
        !useAppLockStore.getState().unlocked
      ) {
        return;
      }

      if (
        useAccountStore.getState().isSwitching
      ) {
        if (__DEV__) {
          console.log(
            'APPLOCK skip-lock-while-switching',
          );
        }

        return;
      }

      void persistActiveSession()
        .catch(() => undefined)
        .finally(() => {
          // Re-check: a switch may have started
          // while persistence was in flight.
          if (
            useAccountStore.getState()
              .isSwitching
          ) {
            return;
          }

          lockApp();

          if (__DEV__) {
            console.log('APPLOCK locked');
          }
        });
    };

    const subscription =
      AppState.addEventListener(
        'change',
        onChange,
      );

    return () => {
      subscription.remove();
    };
  }, [lockApp, persistActiveSession]);

  // After the first successful unlock + hydrate,
  // keep the session UI mounted under a PIN
  // overlay. Replacing the tree on every lock was
  // destroying the live WebView and forcing a full
  // Messenger reload (empty/missing history until
  // Meta re-synced).
  const [sessionSurfaceReady, setSessionSurfaceReady] =
    useState(false);

  useEffect(() => {
    if (unlocked && hydrated && !resuming) {
      setSessionSurfaceReady(true);
    }
  }, [unlocked, hydrated, resuming]);

  if (!lockReady) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!lockConfig) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle={barStyle} />
        <SetupPinScreen />
      </SafeAreaProvider>
    );
  }

  const showUnlockGate = !unlocked;
  const showBootLoading =
    unlocked &&
    (!hydrated ||
      (resuming && !sessionSurfaceReady));
  const showSessionSurface =
    sessionSurfaceReady && hydrated;

  const openAccount =
    async (
      accountId: string,
    ) => {
      try {
        await switchAccount(
          accountId,
        );

        setRoute({
          name: 'messenger',
        });
      } catch (error) {
        if (
          error instanceof
          SessionExpiredError
        ) {
          setRoute({
            name: 'login',
            reauthAccountId:
              accountId,
          });

          return;
        }

        Alert.alert(
          'Unable to switch account',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        );
      }
    };

  const messengerCallbacks = {
    onAddAccount: () => {
      setRoute({ name: 'login' });
    },

    onReauthenticate: (
      accountId: string,
    ) => {
      setRoute({
        name: 'login',
        reauthAccountId: accountId,
      });
    },

    onBackToAccounts: () => {
      setRoute({ name: 'home' });
    },

    onOpenDiagnostics: () => {
      setRoute({ name: 'diagnostics' });
    },
  };

  let content: React.ReactNode = null;

  switch (route.name) {
    case 'home':
      content = (
        <HomeScreen
          onSelectAccount={(
            accountId,
          ) => {
            void openAccount(
              accountId,
            );
          }}

          onAddAccount={() => {
            setRoute({
              name: 'login',
            });
          }}

          onManageAccounts={() => {
            setRoute({
              name: 'manage',
            });
          }}

          onOpenSecurity={() => {
            setRoute({
              name: 'security',
              from: 'home',
            });
          }}

          onOpenPrivacy={() => {
            setRoute({
              name: 'privacy',
              from: 'home',
            });
          }}
        />
      );
      break;

    case 'manage':
      content = (
        <ManageAccountsScreen
          onBack={() => {
            setRoute({
              name: 'home',
            });
          }}

          onOpenSecurity={() => {
            setRoute({
              name: 'security',
              from: 'manage',
            });
          }}

          onOpenPrivacy={() => {
            setRoute({
              name: 'privacy',
              from: 'manage',
            });
          }}
        />
      );
      break;

    case 'security':
      content = (
        <SecuritySettingsScreen
          onBack={() => {
            setRoute(
              route.from === 'home'
                ? { name: 'home' }
                : { name: 'manage' },
            );
          }}

          onOpenPrivacy={() => {
            setRoute({
              name: 'privacy',
              from:
                route.from === 'home'
                  ? 'security-home'
                  : 'security-manage',
            });
          }}
        />
      );
      break;

    case 'privacy':
      content = (
        <PrivacyPolicyScreen
          onBack={() => {
            switch (route.from) {
              case 'home':
                setRoute({ name: 'home' });
                break;
              case 'manage':
                setRoute({ name: 'manage' });
                break;
              case 'security-home':
                setRoute({
                  name: 'security',
                  from: 'home',
                });
                break;
              case 'security-manage':
                setRoute({
                  name: 'security',
                  from: 'manage',
                });
                break;
            }
          }}
        />
      );
      break;

    case 'login':
      content = (
        <LoginScreen
          reauthAccountId={
            route.reauthAccountId
          }

          onComplete={() => {
            setRoute({
              name: 'messenger',
            });
          }}

          onCancel={(destination) => {
            setRoute(
              destination ===
                'messenger'
                ? {
                    name:
                      'messenger',
                  }
                : {
                    name: 'home',
                  },
            );
          }}
        />
      );
      break;

    case 'messenger':
      // In multi-live mode the Messenger surface is rendered
      // once, outside the router, so leaving this route cannot
      // unmount the warm WebViews.
      content = multiLive ? null : (
        <MessengerScreen
          multiLive={false}
          {...messengerCallbacks}
        />
      );
      break;

    case 'diagnostics':
      content = (
        <SessionDiagnosticsScreen
          onBack={() => {
            setRoute({
              name: 'messenger',
            });
          }}
        />
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={barStyle}
      />

      {showBootLoading && (
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      )}

      {showSessionSurface && (
        <View
          style={styles.sessionSurface}
          pointerEvents={
            unlocked ? 'auto' : 'none'
          }
        >
          <SensitiveScreen>
            {/*
              Multi-live: the Messenger surface lives above the
              router and is only hidden, never unmounted. Route
              changes (Home, Manage, Security, Login) used to
              destroy the WebView and force a full reload with an
              empty inbox on the way back.
            */}
            {multiLive && (
              <View
                style={[
                  styles.persistentMessenger,
                  route.name === 'messenger'
                    ? styles.messengerVisible
                    : styles.messengerHidden,
                ]}
                pointerEvents={
                  route.name === 'messenger'
                    ? 'auto'
                    : 'none'
                }
                collapsable={false}
              >
                <MessengerScreen
                  multiLive
                  {...messengerCallbacks}
                />
              </View>
            )}

            {content !== null && (
              <View style={styles.routeLayer}>
                {content}
              </View>
            )}
          </SensitiveScreen>
        </View>
      )}

      {showUnlockGate && (
        <View
          style={
            showSessionSurface
              ? styles.lockOverlay
              : styles.lockFullscreen
          }
        >
          <UnlockScreen />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const makeStyles = (
  colors: ThemeColors,
) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },

    sessionSurface: {
      flex: 1,
    },

    persistentMessenger: {
      ...StyleSheet.absoluteFill,
    },

    messengerVisible: {
      opacity: 1,
      zIndex: 1,
    },

    messengerHidden: {
      opacity: 0,
      zIndex: 0,
    },

    routeLayer: {
      flex: 1,
      zIndex: 2,
    },

    lockFullscreen: {
      flex: 1,
    },

    lockOverlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 100,
    },
  });
