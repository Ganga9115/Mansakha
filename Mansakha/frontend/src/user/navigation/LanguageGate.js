import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../shared/theme/colors';
import { useLanguage } from '../shared/context/LanguageContext';
import LanguageSelectScreen from '../onboarding/screens/LanguageSelectScreen';
import UserLoginScreen from '../auth/screens/LoginScreen';

// Shown once, before User Login - Build Prompt Section 8's Screen
// Inventory lists Language Select as the User App's first screen. Gated the
// same way UserGate gates Consent before Home: once a language is
// persisted (AsyncStorage, via LanguageContext), this never shows again.
export default function LanguageGate(props) {
  const { language, isLoading } = useLanguage();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!language) return <LanguageSelectScreen onSelected={() => {}} />;
  return <UserLoginScreen {...props} />;
}
