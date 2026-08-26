import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';

export default function SignupSuccessScreen({ route }) {
  const { login } = useAuth();
  const { tier } = useResponsive();
  const token = route.params?.token;

  const handleContinue = async () => {
    if (token) {
      // Completes authentication and triggers VictimGate to load main home screen
      await login({ token, accountType: 'victim' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { maxWidth: authContentWidth[tier] }]}>
        {/* Celebration Illustration Graphic */}
        <View style={styles.illustrationWrapper}>
          <View style={styles.badgeBackground}>
            <View style={styles.iconCircle}>
              <Feather name="check-circle" size={54} color="#519BCE" />
            </View>
            <View style={styles.sparkle1}>
              <Feather name="sparkles" size={24} color="#38BDF8" />
            </View>
            <View style={styles.sparkle2}>
              <Feather name="heart" size={20} color="#F43F5E" />
            </View>
          </View>
        </View>

        {/* Text Content */}
        <Text style={styles.title}>SUCCESS!!</Text>
        <Text style={styles.subtitle}>
          You have signed up successfully ! Continue to explore your community
        </Text>

        {/* Action Button */}
        <Pressable style={styles.actionButton} onPress={handleContinue}>
          <Text style={styles.actionButtonText}>Join your family!</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF5FF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#519BCE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  illustrationWrapper: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBackground: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  sparkle1: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  sparkle2: {
    position: 'absolute',
    bottom: 12,
    left: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1.2,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#519BCE',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
    marginBottom: 36,
  },
  actionButton: {
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
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});