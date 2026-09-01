import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { authContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';

export default function OnboardingScreen({ navigation }) {
  const { tier } = useResponsive();

  useEffect(() => {
    if (Platform.OS === 'web') {
      navigation.replace('UserLogin');
    }
  }, [navigation]);

  if (Platform.OS === 'web') {
    return null;
  }
  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1, width: '100%', maxWidth: authContentWidth[tier], alignSelf: 'center' }}>
        {/* Curved Blue Top Header */}
        <View style={styles.headerBackground}>
          <Text style={styles.brandTitle}>MANSAKHA</Text>
          <Text style={styles.tagline}>Your trusted support & advocacy portal</Text>

          {/* Hero Graphic Badge */}
          <View style={styles.heroIllustrationContainer}>
            <View style={styles.illustrationCircle}>
              <Feather name="shield" size={68} color="#0284C7" />
              <View style={styles.floatingBadgeLeft}>
                <Feather name="file-text" size={20} color="#38BDF8" />
              </View>
              <View style={styles.floatingBadgeRight}>
                <Feather name="heart" size={20} color="#F43F5E" />
              </View>
            </View>
          </View>
        </View>

        {/* Main Content Area */}
        <View style={styles.contentContainer}>
          <Text style={styles.description}>
            A secure companion for tracking case updates, legal assistance, and official rehabilitation support.
          </Text>

          {/* Carousel Pagination Dots */}
          <View style={styles.paginationDots}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.activeDot]} />
            <View style={styles.dot} />
          </View>

          {/* Action Button */}
          <View style={styles.actionWrapper}>
            <Pressable
              style={styles.getStartedBtn}
              onPress={() => navigation.navigate('UserLogin')}
            >
              <Text style={styles.getStartedBtnText}>Get started</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBackground: {
    backgroundColor: '#80CAFF',
    paddingTop: 48,
    paddingBottom: 60,
    alignItems: 'center',
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 140,
    paddingHorizontal: 24,
  },
  brandTitle: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    fontStyle: 'italic',
    color: '#FFFFFF',
    marginTop: 4,
    fontWeight: '500',
  },
  heroIllustrationContainer: {
    marginTop: 28,
    marginBottom: -40,
  },
  illustrationCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  floatingBadgeLeft: {
    position: 'absolute',
    top: 10,
    left: -8,
    backgroundColor: '#E0F2FE',
    padding: 8,
    borderRadius: 20,
  },
  floatingBadgeRight: {
    position: 'absolute',
    bottom: 12,
    right: -8,
    backgroundColor: '#FFE4E6',
    padding: 8,
    borderRadius: 20,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 36,
  },
  description: {
    fontSize: 15,
    color: '#519BCE',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  paginationDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  activeDot: {
    width: 24,
    backgroundColor: '#80CAFF',
  },
  actionWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  getStartedBtn: {
    width: '100%',
    backgroundColor: '#80CAFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#80CAFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  getStartedBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});