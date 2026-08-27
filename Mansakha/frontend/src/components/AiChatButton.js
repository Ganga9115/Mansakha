import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { useResponsive } from '../hooks/useResponsive';

export default function AiChatButton() {
  const navigation = useNavigation();
  const { isDesktop } = useResponsive();

  return (
    <Pressable
      style={[styles.fab, { bottom: isDesktop ? 24 : 84 }]}
      onPress={() => navigation.navigate('Chatbot')}
      accessibilityRole="button"
      accessibilityLabel="Open AI Chatbot"
    >
      <Feather name="message-circle" size={24} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
    zIndex: 20,
  },
});
