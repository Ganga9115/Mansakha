import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useMobileSidebar } from '../context/MobileSidebarContext';
import { useUserDashboard, useAssignedCounsellor } from '../services/hooks';
import { sidebarWidth } from '../theme/layout';
import { TAB_ITEMS, TAB_ICONS } from '../../navigation/tabConfig';
import SidebarNav from './SidebarNav';

// The mobile/tablet hamburger menu (MenuButton opens it via
// MobileSidebarContext). Mounted once as a sibling of the bottom-tab
// navigator in UserShell.js, so it isn't itself a descendant of the Tab
// Navigator - it renders the exact same SidebarNav component the desktop
// permanent drawer uses (same icons, labels, active-item styling), fed a
// synthetic state/descriptors/navigation shaped like what SidebarNav
// normally gets from a real react-navigation Drawer, since a slide-in
// overlay here (not a second real navigator) is what lets phone/tablet keep
// their existing bottom-tab-bar navigation completely untouched.
export default function MobileSidebarOverlay() {
  const { isOpen, close } = useMobileSidebar();
  const navigation = useNavigation();
  const dashboard = useUserDashboard();
  const counsellor = useAssignedCounsellor();
  const showMyCounsellor = !!(dashboard.data?.optedForManualCounsellor && counsellor.data?.assigned);

  const translateX = useRef(new Animated.Value(-sidebarWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: isOpen ? 0 : -sidebarWidth, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: isOpen ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [isOpen]);

  // Same technique AiChatButton already uses to find the active tab name -
  // this overlay sits at the root stack's level (a sibling of the Tab
  // Navigator, not a descendant of it), so it reads the tab bar's active
  // route off the root stack's own nested state instead of directly.
  const activeTabName = useNavigationState((state) => {
    if (!state) return null;
    const currentRoute = state.routes[state.index];
    if (currentRoute.state && currentRoute.state.routes) {
      return currentRoute.state.routes[currentRoute.state.index].name;
    }
    return currentRoute.name;
  });

  const visibleItems = TAB_ITEMS.filter((item) => item.name !== 'mycounsellor' || showMyCounsellor);
  const sidebarState = {
    index: visibleItems.findIndex((item) => item.name === activeTabName),
    routes: visibleItems.map((item) => ({ key: item.name, name: item.name })),
  };
  const descriptors = visibleItems.reduce((acc, item) => {
    acc[item.name] = { options: { title: item.title } };
    return acc;
  }, {});
  const sidebarNavigation = {
    navigate: (name) => {
      close();
      navigation.navigate('MainTabs', { screen: name });
    },
  };

  return (
    <View style={styles.container} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
      </Animated.View>
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        <SidebarNav
          state={sidebarState}
          descriptors={descriptors}
          navigation={sidebarNavigation}
          icons={TAB_ICONS}
          showMyCounsellor={showMyCounsellor}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: sidebarWidth,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
});
