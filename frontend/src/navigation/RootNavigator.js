import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { colors } from '../theme/colors';

import MinistryLoginScreen from '../screens/ministry/LoginScreen';
import StaffLoginScreen from '../screens/staff/LoginScreen';
import ChangePasswordScreen from '../screens/staff/ChangePasswordScreen';
import StaffShell from './StaffShell';
import VictimGate from './VictimGate';
import LanguageGate from './LanguageGate';

const Stack = createNativeStackNavigator();

// MinistryLogin is deliberately reachable ONLY via this direct path, never through
// an in-app link (see staff/LoginScreen.js) - it's the internal-only Super Admin
// entry point. The path is a non-obvious slug on purpose, not "/ministry" or
// "/admin" - those are exactly the paths someone probing a government app would
// guess first. Someone has to already know (and likely bookmark) this URL; it
// isn't discoverable by tapping around the public-facing app OR by guessing
// common admin-console names. A fully separate deployment would be the more
// airtight real-world answer, but that's a bigger architectural change than this
// fix - flagging it rather than deciding it unilaterally.
const linking = {
  prefixes: [],
  config: {
    screens: {
      VictimLogin: '',
      StaffLogin: 'staff',
      MinistryLogin: 'console-7f92xk',
    },
  },
};

// Three distinct login surfaces stay three distinct entry points all the way
// through (Build Prompt Section 3) - this resolver picks the right shell once
// authenticated, using GET /api/me to find the official's actual role/jurisdiction
// rather than trusting anything decoded from the token client-side.
export default function RootNavigator() {
  const { session, isLoading, logout } = useAuth();
  const [resolvedScope, setResolvedScope] = useState(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!session?.token || session.accountType === 'victim') {
      setResolvedScope(null);
      return;
    }
    setResolving(true);
    apiClient
      .get('/api/me', session.token)
      .then((data) => {
        const primary = data.roles?.[0] || null;
        setResolvedScope(
          primary ? { roleName: primary.roleName, jurisdictionId: primary.jurisdictionId, jurisdictionLevel: primary.jurisdictionLevel } : null
        );
      })
      .catch(() => {
        // A stale/expired/invalid token (or the backend being briefly
        // unreachable) left resolvedScope stuck at null forever, with a session
        // still cached - none of the four screen conditions below matched
        // anything, so the Stack.Navigator ended up with zero children, which
        // is exactly React Navigation's "couldn't find any screens" crash.
        // Treating a failed /api/me as an invalid session and logging out is
        // what gets back to a real screen instead of a dead end.
        setResolvedScope(null);
        logout();
      })
      .finally(() => setResolving(false));
  }, [session?.token, session?.accountType]);

  if (isLoading || resolving) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // A staff/ministry session whose scope hasn't resolved yet (still loading, or -
  // now that the .catch() above logs out on failure - only reachable for one
  // render before that takes effect) falls back to the spinner instead of
  // leaving the Stack.Navigator with nothing to render. This is what actually
  // guarantees the "couldn't find any screens" crash can't recur, on top of the
  // .catch() fix above addressing the root cause.
  const staffSessionUnresolved = session && session.accountType !== 'victim' && !session.mustChangePassword && !resolvedScope;
  if (staffSessionUnresolved) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session && (
          <>
            <Stack.Screen name="VictimLogin" component={LanguageGate} />
            <Stack.Screen name="StaffLogin" component={StaffLoginScreen} />
            <Stack.Screen name="MinistryLogin" component={MinistryLoginScreen} />
          </>
        )}

        {session?.accountType === 'victim' && (
          <Stack.Screen name="VictimShell" component={VictimGate} />
        )}

        {session && session.accountType !== 'victim' && session.mustChangePassword && (
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        )}

        {session && session.accountType !== 'victim' && !session.mustChangePassword && resolvedScope && (
          <Stack.Screen name="StaffShell">
            {() => <StaffShell roleName={resolvedScope.roleName} jurisdictionId={resolvedScope.jurisdictionId} jurisdictionLevel={resolvedScope.jurisdictionLevel} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
