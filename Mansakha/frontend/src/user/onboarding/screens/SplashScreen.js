import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';

export default function SplashScreen({ onFinish }) {
  const logoAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    // Logo fade-in animation
    Animated.timing(logoAnim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Fallback progress bar animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Keep splash screen for 3 seconds
    const timer = setTimeout(() => {
      if (onFinish) {
        onFinish();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {!imageError ? (
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoAnim,
            },
          ]}
        >
          <Image
            source={require('../../../../assets/mansakha-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setImageError(true)}
          />
        </Animated.View>
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F9FF', // Soft Sky Blue
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 300,
    height: 300,
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