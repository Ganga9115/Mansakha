import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { topBarHeight } from '../theme/layout';

// Same palette AND spacing rhythm as the Staff/Ministry web app's
// Counsellor sidebar (web-frontend/src/layouts/StaffLayout.jsx: p-6
// nav padding, space-y-2 item gap, px-4 py-3 item padding, 18px icons)
// so the two read as the exact same sidebar on both web experiences.
const SIDEBAR = {
  bg: colors.sidebarBg,       // #3D5A80
  active: colors.sidebarAccent, // #519BCE
  textInactive: '#C7D9F0',    // Tailwind blue-100 equivalent
  tagline: '#BFDBFE',         // Tailwind blue-200 equivalent
  textActive: colors.sidebarTextActive, // #FFFFFF
  divider: 'rgba(255,255,255,0.15)',
  pressedOverlay: 'rgba(255,255,255,0.1)',
};

// Desktop-tier navigation chrome, rendered as a permanent drawer's
// `drawerContent`. Receives the same { state, descriptors, navigation }
// shape react-navigation gives any custom nav surface, so route state
// stays driven by the navigator - this only renders the chrome.
export default function SidebarNav({ state, descriptors, navigation, icons = {}, showMyCounsellor = false }) {
  return (
    <View style={styles.container}>
      {/* Corner cell - pinned to topBarHeight, matching each screen's own
          compact desktop banner, so the two read as one continuous strip
          across the top of the screen. Logout lives in Profile at the
          bottom, not here - one place for it, not duplicated in the
          sidebar too. */}
      <View style={styles.cornerCell}>
        {/* Mansakha Logo */}
        <Image
          source={require('../../../../assets/logo-3.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.body}>
        <View style={styles.items}>
          {state?.routes?.map((route, index) => {
            // Hide secondary/internal screens that aren't mapped in TAB_ICONS
            if (!icons[route.name]) return null;
            
            // Hide 'mycounsellor' if the user isn't opted in or assigned
            if (route.name === 'mycounsellor' && !showMyCounsellor) return null;

            const descriptor = descriptors?.[route.key];
            const options = descriptor?.options || {};
            const label = options.title ?? route.name;
            const isActive = state.index === index;
            const iconName = icons[route.name];

            return (
              <Pressable
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                style={({ pressed }) => [
                  styles.item,
                  isActive && styles.itemActive,
                  pressed && !isActive && styles.itemPressed,
                ]}
              >
                <Feather
                  name={iconName}
                  size={18}
                  color={
                    isActive
                      ? SIDEBAR.textActive
                      : SIDEBAR.textInactive
                  }
                />

                <Text
                  style={[
                    styles.itemLabel,
                    isActive && styles.itemLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIDEBAR.bg,
  },

  cornerCell: {
    height: topBarHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: SIDEBAR.divider,
  },

  // Mansakha logo
  logo: {
    width: 185,
    height: 130,
  },

  body: {
    flex: 1,
  },

  items: {
    padding: spacing.xxl,
    gap: spacing.sm,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },

  itemActive: {
    backgroundColor: SIDEBAR.active,
  },

  itemPressed: {
    backgroundColor: SIDEBAR.pressedOverlay,
  },

  itemLabel: {
    ...typography.bodyStrong,
    color: SIDEBAR.textInactive,
    marginLeft: spacing.md,
    fontSize: 14,
  },

  itemLabelActive: {
    color: SIDEBAR.textActive,
  },
});