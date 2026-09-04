import React from 'react';
import { View, ActivityIndicator, Platform, Linking as RNLinking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../shared/context/AuthContext';
import { colors } from '../shared/theme/colors';

import UserGate from './UserGate';
import LanguageGate from './LanguageGate';
import OnboardingScreen from '../onboarding/screens/OnboardingScreen';

const Stack = createNativeStackNavigator();

const isWeb = Platform.OS === 'web';

// Web-only: the `screens` map below only maps the 3 top-level routes, so the
// URL never changes as a user navigates deeper into UserShell (Home, History,
// Support, the Act page, etc.) - a browser reload always re-mounts at '/' and
// loses whatever screen was open. Persisting the full navigation state and
// restoring it as `initialState` is React Navigation's own documented fix for
// this ("state persistence"), without hand-mapping every nested Tab/Drawer/
// Stack screen to its own URL.
//
// Deliberately window.sessionStorage, NOT AsyncStorage (localStorage on web):
// localStorage is shared across every tab of the same origin, so with two
// Mansakha tabs open, tab B's own navigation silently overwrites tab A's
// saved screen in that shared store - reloading tab A then restores tab B's
// screen instead of its own (confirmed live: this is why a reload could land
// on a totally unrelated screen, like AI Chat, that was only ever open in a
// *different* tab). sessionStorage is isolated per tab even for the same
// origin, which is exactly the "this tab, this reload" scope actually wanted
// here - and it's still just as synchronous/reload-durable as localStorage
// within that one tab. Native is untouched - a killed-and-relaunched native
// app is expected to start fresh at Home, not resume mid-flow, and reload
// isn't a native gesture anyway.
const NAV_STATE_STORAGE_KEY = 'mansakha_nav_state';

const navStateStorage = {
  getItem: async (key) => (isWeb ? window.sessionStorage.getItem(key) : null),
  setItem: async (key, value) => { if (isWeb) window.sessionStorage.setItem(key, value); },
  removeItem: async (key) => { if (isWeb) window.sessionStorage.removeItem(key); },
};

const linking = {
  prefixes: [],
  config: {
    screens: {
      Onboarding: 'welcome',
      UserLogin: 'login',
      UserShell: '',
    },
  },
  getInitialURL: async () => {
    if (isWeb) {
      const saved = await navStateStorage.getItem(NAV_STATE_STORAGE_KEY);
      if (saved) return undefined; // let `initialState` (restored below) win instead
    }
    return RNLinking.getInitialURL();
  },
};

export default function RootNavigator() {
  const { session, isLoading } = useAuth();
  const [isNavStateReady, setIsNavStateReady] = React.useState(!isWeb);
  const [initialNavState, setInitialNavState] = React.useState();

  React.useEffect(() => {
    if (!isWeb) return;
    // Wait for AuthContext's own async session check to resolve first - on
    // the very first render `session` is still null (isLoading true) purely
    // because that check hasn't finished yet, not because the user is
    // logged out. Running the consistency check below against that
    // not-yet-resolved null incorrectly rejected every valid saved state
    // (confirmed live: reload always landed back on Home instead of the
    // screen that was open, even though the state was being saved correctly).
    if (isLoading) return;
    (async () => {
      try {
        const saved = await navStateStorage.getItem(NAV_STATE_STORAGE_KEY);
        const state = saved ? JSON.parse(saved) : null;
        // Only trust a saved state that matches the current session (e.g. not
        // a state saved while logged in, being restored after a logout+
        // reload) - a mismatch here would hand the Stack.Navigator a route
        // name ("UserShell") that isn't even one of its current children.
        const topRouteName = state?.routes?.[state.index ?? state.routes.length - 1]?.name;
        const isConsistentWithSession = session ? topRouteName === 'UserShell' : topRouteName !== 'UserShell';
        if (state && isConsistentWithSession) setInitialNavState(state);
      } finally {
        setIsNavStateReady(true);
      }
    })();
  }, [isLoading, session]);

  if (isLoading || !isNavStateReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer
      linking={linking}
      initialState={isWeb ? initialNavState : undefined}
      onStateChange={isWeb ? (state) => navStateStorage.setItem(NAV_STATE_STORAGE_KEY, JSON.stringify(state)) : undefined}
    >
      <Stack.Navigator initialRouteName={session ? 'UserShell' : (isWeb ? 'UserLogin' : 'Onboarding')} screenOptions={{ headerShown: false }}>
        {!session && (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="UserLogin" component={LanguageGate} />
          </>
        )}

        {session && (
          <Stack.Screen name="UserShell" component={UserGate} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
