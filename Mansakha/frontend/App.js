import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
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
import { ActiveCaseProvider } from './src/user/shared/context/ActiveCaseContext';
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

// This is a classic (non-Router) Expo app - `main` is expo/AppEntry.js, no
// app/ directory - so neither of Expo's two documented ways to customize
// the served HTML (web/index.html for the legacy Webpack bundler, or
// app/+html.tsx for Expo Router) actually applies here; confirmed live that
// dropping a web/index.html in and restarting the dev server had zero
// effect, it kept serving Metro's own hardcoded default. That default's
// viewport meta tag has no `interactive-widget` directive, so on many
// mobile browsers the *layout* viewport (what html/body/#root's `height:
// 100%` is measured against - see Metro's own injected #expo-reset style)
// never actually shrinks when the on-screen keyboard opens - only the
// *visual* viewport does - so anything anchored to the bottom of that
// still-full-height flex tree (every screen's own message/text composer)
// can end up sitting behind the keyboard instead of rising above it the
// way WhatsApp's does. Patching the tag directly at runtime instead, since
// no build-time template point exists to change it at the source.
function useWebViewportKeyboardFix() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta && !meta.content.includes('interactive-widget')) {
      meta.content = `${meta.content}, interactive-widget=resizes-content`;
    }
  }, []);
}

export default function App() {
  useWebViewportKeyboardFix();
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
                  <ActiveCaseProvider>
                    <RootNavigator />
                  </ActiveCaseProvider>
                </AuthProvider>
              </LanguageProvider>
            </ToastProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}