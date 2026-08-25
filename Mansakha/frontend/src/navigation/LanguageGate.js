import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { useLanguage } from '../context/LanguageContext';
import LanguageSelectScreen from '../screens/victim/LanguageSelectScreen';
import VictimLoginScreen from '../screens/victim/LoginScreen';

// Shown once, before Victim Login - Build Prompt Section 8's Screen
// Inventory lists Language Select as the Victim App's first screen. Gated
// the same way VictimGate gates Consent before Home: once a language is
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
  return <VictimLoginScreen {...props} />;
}
