import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

import VictimSignupScreen from '../screens/victim/VictimSignupScreen';
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
    },
  },
};

export default function RootNavigator() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
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
          </>
        )}

        {session && (
          <Stack.Screen name="VictimShell" component={VictimGate} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
