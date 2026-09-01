import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../shared/context/AuthContext';
import { colors } from '../shared/theme/colors';

import UserGate from './UserGate';
import LanguageGate from './LanguageGate';
import OnboardingScreen from '../onboarding/screens/OnboardingScreen';

const Stack = createNativeStackNavigator();

const isWeb = Platform.OS === 'web';

const linking = {
  prefixes: [],
  config: {
    screens: {
      Onboarding: 'welcome',
      UserLogin: 'login',
      UserShell: '',
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
