import React from 'react';
import { View, StyleSheet } from 'react-native';
import GetHelpButton from './GetHelpButton';
import NotificationBell from './NotificationBell';

// The notification bell is Home-screen-only (showNotifications) - every
// other screen that renders this in its header just gets the call icon.
export default function TopRightActions({ showNotifications = false }) {
  // The header's old "Talk to Mansakha by voice" phone-call icon has been
  // repurposed into the Get Help Now emergency action below (the AI
  // chatbot is still reachable via the floating AiChatButton FAB, so no
  // entry point is actually lost).

  return (
    <View style={styles.container}>
      {showNotifications && <NotificationBell />}
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
});
