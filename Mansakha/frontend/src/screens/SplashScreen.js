import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';

export default function SplashScreen({ onFinish }) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Smoothly animate progress bar line from 0% to 100% over 3000ms (3 seconds)
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(() => {
      if (onFinish) onFinish();
    });
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Soft Mind & Peace Logo Badge */}
        <View style={styles.logoBadgeOuter}>
          <View style={styles.logoBadgeInner}>
            <View style={styles.iconCircle}>
              <Feather name="heart" size={18} color={colors.primary} />
            </View>
            <Feather name="sun" size={32} color={colors.primary} style={styles.backgroundSunIcon} />
          </View>
        </View>

        {/* Brand Name & Tagline */}
        <Text style={styles.title}>Mansakha</Text>
        <Text style={styles.tagline}>Mind matters. We’re listening.</Text>

        {/* 3-Second Loading Line Indicator */}
        <View style={styles.progressBarTrack}>
          <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center', // Vertically centers content on screen
    alignItems: 'center',     // Horizontally centers content on screen
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: spacing.xxl,
  },
  logoBadgeOuter: {
    width: 104,
    height: 104,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: '#BBE1FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoBadgeInner: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: '#D0E9FD',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  backgroundSunIcon: {
    position: 'absolute',
    opacity: 0.35,
  },
  title: {
    fontSize: 32,
    fontFamily: 'PublicSans_700Bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'PublicSans_500Medium',
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  progressBarTrack: {
    width: 140,
    height: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
});