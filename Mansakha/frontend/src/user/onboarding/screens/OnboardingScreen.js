import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform, Image } from 'react-native';
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
        {/* Curved Top Header using the top blob color */}
        <View style={styles.headerBackground}>
          <Image
            source={require('../../../../assets/logo-2.png')}
            style={styles.logo}
            resizeMode="contain"
          />
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
    backgroundColor: '#DDD0F5',
    paddingTop: 64,
    paddingBottom: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 140,
    paddingHorizontal: 24,
  },
  logo: {
    width: '75%',
    height: 120,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 36,
  },
  description: {
    fontSize: 15,
    color: '#4A3070',
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
    backgroundColor: '#C4AEE8',
  },
  actionWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  getStartedBtn: {
    width: '100%',
    backgroundColor: '#DDD0F5', // Updated to match header curve color
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#DDD0F5', // Updated shadow color
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  getStartedBtnText: {
    color: '#4A3070',
    fontSize: 18,
    fontWeight: '700',
  },
});