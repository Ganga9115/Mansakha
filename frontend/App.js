import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/context/AuthContext';
import { ToastProvider } from './src/context/ToastContext';
import { LanguageProvider } from './src/context/LanguageContext';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

const queryClient = new QueryClient();

// GestureHandlerRootView is required by @react-navigation/drawer (StaffShell.js) -
// react-native-gesture-handler was already a dependency but this wrapper was never
// added since Drawer was never actually used until now.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
