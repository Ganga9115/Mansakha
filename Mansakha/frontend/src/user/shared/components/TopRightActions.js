import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GetHelpButton from './GetHelpButton';
import { colors } from '../theme/colors';
import { useMyNotifications } from '../services/hooks';

// The notification bell is Home-screen-only (showNotifications) - every
// other screen that renders this in its header just gets the call icon.
export default function TopRightActions({ showNotifications = false }) {
  const navigation = useNavigation();
  // Only fetched when the bell is actually shown - no point polling this on
  // every other screen's header render.
  const { data } = useMyNotifications({ enabled: showNotifications });
  const hasNotifications = (data?.notifications || []).length > 0;

  // The header's old "Talk to Mansakha by voice" phone-call icon has been
  // repurposed into the Get Help Now emergency action below (the AI
  // chatbot is still reachable via the floating AiChatButton FAB, so no
  // entry point is actually lost).

  return (
    <View style={styles.container}>
      {showNotifications && (
        <Pressable style={styles.iconCircleBtn} onPress={() => navigation?.navigate('notifications')}>
          <Feather name="bell" size={18} color={colors.primaryDark} />
          {hasNotifications && <View style={styles.bellDot} />}
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
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
});
