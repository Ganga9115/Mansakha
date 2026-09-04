import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { typography } from '../../shared/theme/typography';

// A neutral mid-tone for the head/limbs so the figure reads as a person
// rather than a brand-colored blue shape.
const SKIN_TONE = '#C68863';

// Native fallback for the 3D "Cesium Man" walk viewer (see
// Exercise3DViewer.web.js) - react-three-fiber + expo-gl WebGL rendering on
// iOS/Android has not been verified in this environment (no device/simulator
// available), so native gets this simpler 2D walk-cycle animation instead of
// shipping unverified WebGL. Metro/Expo automatically picks the .web.js file
// for web builds and this plain .js file for native, via the platform
// filename convention.
export default function Exercise3DViewer({ running }) {
  const legL = useRef(new Animated.Value(0)).current;
  const legR = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) {
      legL.stopAnimation();
      legR.stopAnimation();
      legL.setValue(0);
      legR.setValue(0);
      return undefined;
    }
    const stepDuration = 500;
    const loopL = Animated.loop(
      Animated.sequence([
        Animated.timing(legL, { toValue: 1, duration: stepDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(legL, { toValue: 0, duration: stepDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const loopR = Animated.loop(
      Animated.sequence([
        Animated.timing(legR, { toValue: 1, duration: stepDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(legR, { toValue: 0, duration: stepDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loopL.start();
    const t = setTimeout(() => loopR.start(), stepDuration);
    return () => {
      clearTimeout(t);
      loopL.stop();
      loopR.stop();
    };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.scene}>
        <View style={styles.head} />
        <View style={styles.torso} />
        <Animated.View
          style={[styles.arm, styles.armLeft, { transform: [{ rotate: legR.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '20deg'] }) }] }]}
        />
        <Animated.View
          style={[styles.arm, styles.armRight, { transform: [{ rotate: legL.interpolate({ inputRange: [0, 1], outputRange: ['20deg', '-20deg'] }) }] }]}
        />
        <Animated.View
          style={[styles.leg, styles.legLeft, { transform: [{ translateY: legL.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }] }]}
        />
        <Animated.View
          style={[styles.leg, styles.legRight, { transform: [{ translateY: legR.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }] }]}
        />
      </View>
      <Text style={styles.caption}>{running ? 'Keep a steady pace' : 'Ready'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  visualWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  scene: { width: 140, height: 160, alignItems: 'center', justifyContent: 'center' },
  head: { position: 'absolute', top: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: SKIN_TONE },
  torso: { position: 'absolute', top: 30, width: 40, height: 70, borderRadius: 20, backgroundColor: colors.primary },
  arm: { position: 'absolute', top: 40, width: 8, height: 50, borderRadius: 4, backgroundColor: SKIN_TONE },
  armLeft: { left: 34 },
  armRight: { right: 34 },
  leg: { position: 'absolute', bottom: 20, width: 12, height: 60, borderRadius: 6, backgroundColor: SKIN_TONE },
  legLeft: { left: 54 },
  legRight: { right: 54 },
  caption: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg },
});
