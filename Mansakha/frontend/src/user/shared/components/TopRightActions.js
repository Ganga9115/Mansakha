import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GetHelpButton from './GetHelpButton';
import { colors } from '../theme/colors';

// The notification bell is Home-screen-only (showNotifications) - every
// other screen that renders this in its header just gets the call icon.
export default function TopRightActions({ showNotifications = false }) {
  const navigation = useNavigation();

  // The header's old "Talk to Mansakha by voice" phone-call icon has been
  // repurposed into the Get Help Now emergency action below (the AI
  // chatbot is still reachable via the floating AiChatButton FAB, so no
  // entry point is actually lost).

  return (
    <View style={styles.container}>
      {showNotifications && (
        <Pressable style={styles.iconCircleBtn} onPress={() => navigation?.navigate('support')}>
          <Feather name="bell" size={18} color={colors.primaryDark} />
        </Pressable>
      )}
      <GetHelpButton asHeaderIcon />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
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
