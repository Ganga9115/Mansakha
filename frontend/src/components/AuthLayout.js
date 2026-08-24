import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// Shared shell for every login screen (Victim/Staff/Ministry) and
// ChangePasswordScreen: softly-tinted backdrop, a centered shadow-card, a logo
// lockup above it. Plain View-based tint, not a gradient library - no new
// dependency for this.
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <ScrollView contentContainerStyle={styles.backdrop} keyboardShouldPersistTaps="handled">
      <View style={styles.logoRow}>
        <View style={styles.logoBadge}>
          <Feather name="heart" size={26} color={colors.onPrimary} />
        </View>
        <Text style={styles.logoText}>Mansakha</Text>
        <Text style={styles.tagline}>Mind matters. We're listening.</Text>
      </View>

      <View style={styles.card}>
        {title && <Text style={styles.title}>{title}</Text>}
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flexGrow: 1, backgroundColor: colors.surface, alignItems: 'center',
    justifyContent: 'center', padding: 24,
  },
  logoRow: { alignItems: 'center', marginBottom: 24 },
  logoBadge: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  logoText: { fontSize: 24, fontWeight: '700', color: colors.primaryDark },
  tagline: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: colors.background,
    borderRadius: 16, padding: 24,
    shadowColor: '#0B2439', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
});
