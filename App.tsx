import React, {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';

import {
  HomeScreen,
} from './src/screens/HomeScreen';

import {
  LoginScreen,
} from './src/screens/LoginScreen';

import {
  MessengerScreen,
} from './src/screens/MessengerScreen';

import {
  SessionExpiredError,
} from './src/services/cookieManager';

import {
  useAccountStore,
} from './src/store/accountStore';

type Route =
  | {
      name: 'home';
    }
  | {
      name: 'messenger';
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

  const activeAccountId =
    useAccountStore(
      (state) =>
        state.activeAccountId,
    );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
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

          onCancel={() => {
            setRoute(
              activeAccountId
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
        />
      );
      break;
  }

  return (
    <>
      <StatusBar
        barStyle="dark-content"
      />

      {content}
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
