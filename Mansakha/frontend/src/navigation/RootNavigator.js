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
import VictimSignupScreen from '../screens/victim/VictimSignupScreen';
import StaffShell from './StaffShell';
import VictimGate from './VictimGate';
import LanguageGate from './LanguageGate';
import SignupSuccessScreen from '../screens/victim/SignupSuccessScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

const Stack = createNativeStackNavigator();

const linking = {
  prefixes: [],
  config: {
    screens: {
      Onboarding: 'welcome',
      VictimLogin: '',
      VictimSignup: 'signup',
      StaffLogin: 'staff',
      MinistryLogin: 'console-7f92xk',
    },
  },
};

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
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="VictimLogin" component={LanguageGate} />
            <Stack.Screen name="VictimSignup" component={VictimSignupScreen} />
            <Stack.Screen name="SignupSuccess" component={SignupSuccessScreen} />
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