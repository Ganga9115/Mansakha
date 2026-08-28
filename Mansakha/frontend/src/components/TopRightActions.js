import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import SosButton from './SosButton';
import { colors } from '../theme/colors';

export default function TopRightActions() {
  const navigation = useNavigation();

  // Was previously wired to auto-start CheckinScreen's voice "Call mode" -
  // that mode was removed when Check-in was rewritten into the 15-question
  // Ollama questionnaire flow (no Chat/Call toggle exists there anymore), so
  // this now just opens the check-in flow itself, still the most direct way
  // to talk to Mansakha's AI from anywhere in the app. Revisit if voice input
  // comes back to the questionnaire flow.
  const handleAiCall = () => {
    navigation?.navigate('Chatbot');
  };

  return (
    <View style={styles.container}>
      <SosButton asHeaderIcon />
      <Pressable
        style={styles.iconCircleBtn}
        onPress={handleAiCall}
        accessibilityRole="button"
        accessibilityLabel="Talk to Mansakha by voice"
      >
        <Feather name="phone-call" size={18} color={colors.primaryDark} />
      </Pressable>
      <Pressable style={styles.iconCircleBtn} onPress={() => navigation?.navigate('support')}>
        <Feather name="bell" size={18} color={colors.primaryDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
