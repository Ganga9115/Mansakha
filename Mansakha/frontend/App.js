import 'react-native-reanimated';
import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_600SemiBold,
  PublicSans_700Bold,
} from '@expo-google-fonts/public-sans';
import { AuthProvider } from './src/user/shared/context/AuthContext';
import { ToastProvider } from './src/user/shared/context/ToastContext';
import { LanguageProvider } from './src/user/shared/context/LanguageContext';
import RootNavigator from './src/user/navigation/RootNavigator';
import ErrorBoundary from './src/user/shared/components/ErrorBoundary';
import SplashScreen from './src/user/onboarding/screens/SplashScreen';
import { colors } from './src/user/shared/theme/colors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    }
  }
});

export default function App() {
  const [splashFinished, setSplashFinished] = useState(false);
  const [fontsLoaded] = useFonts({
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
  });

  // Display continuous loading state until fonts load
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Show splash screen for 3 seconds once fonts are ready
  if (!splashFinished) {
    return <SplashScreen onFinish={() => setSplashFinished(true)} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <LanguageProvider>
                <AuthProvider>
                  <RootNavigator />
                </AuthProvider>
              </LanguageProvider>
            </ToastProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}