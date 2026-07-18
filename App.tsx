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
  SensitiveScreen,
} from './src/components/SensitiveScreen';

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
    }
  | {
      name: 'privacy';
      from: 'security' | 'manage' | 'home';
    }
  | {
      name: 'login';
      reauthAccountId?: string;
    };

export default function App() {
  const [route, setRoute] =
    useState<Route>({
      name: 'home',
    });

  const [resuming, setResuming] =
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

  useEffect(() => {
    void bootstrapLock();
  }, [bootstrapLock]);

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
  // returning always requires PIN/biometric.
  // Use background only (not inactive) to avoid
  // locking during the biometric system sheet.
  useEffect(() => {
    const onChange = (
      nextState: AppStateStatus,
    ) => {
      if (nextState !== 'background') {
        return;
      }

      if (
        !useAppLockStore.getState().unlocked
      ) {
        return;
      }

      void persistActiveSession()
        .catch(() => undefined)
        .finally(() => {
          lockApp();
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

  if (!lockReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
        />
      </View>
    );
  }

  if (!lockConfig) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <SetupPinScreen />
      </>
    );
  }

  if (!unlocked) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <UnlockScreen />
      </>
    );
  }

  if (!hydrated || resuming) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
        />
      </View>
    );
  }

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

  let content: React.ReactNode;

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
            setRoute({
              name: 'manage',
            });
          }}

          onOpenPrivacy={() => {
            setRoute({
              name: 'privacy',
              from: 'security',
            });
          }}
        />
      );
      break;

    case 'privacy':
      content = (
        <PrivacyPolicyScreen
          onBack={() => {
            setRoute(
              route.from === 'home'
                ? { name: 'home' }
                : route.from === 'manage'
                  ? { name: 'manage' }
                  : { name: 'security' },
            );
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
      content = (
        <MessengerScreen
          onAddAccount={() => {
            setRoute({
              name: 'login',
            });
          }}

          onReauthenticate={(
            accountId,
          ) => {
            setRoute({
              name: 'login',
              reauthAccountId:
                accountId,
            });
          }}

          onBackToAccounts={() => {
            setRoute({
              name: 'home',
            });
          }}

          onOpenDiagnostics={() => {
            setRoute({
              name: 'diagnostics',
            });
          }}
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
    <>
      <StatusBar
        barStyle="dark-content"
      />

      <SensitiveScreen>
        {content}
      </SensitiveScreen>
    </>
  );
}

const styles =
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
