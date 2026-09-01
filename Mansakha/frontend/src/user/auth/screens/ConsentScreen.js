import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../shared/context/ToastContext';
import { useSubmitConsent } from '../../shared/services/hooks';
import { authContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';

const THEME = {
  bg: '#FFFFFF',
  textMain: '#0F172A',
  textMuted: '#64748B',
  accentBlue: '#E0F2FE',
  accentIcon: '#0284C7',
  primaryDark: '#0F172A',
  border: '#E2E8F0',
};

const CONSENT_ITEMS = [
  { icon: 'mic', title: 'What we collect', desc: 'Voice and secure text responses from check-ins.' },
  { icon: 'shield', title: 'Why', desc: 'To monitor your daily well-being and offer timely AI help.' },
  { icon: 'help-circle', title: 'Who can access', desc: 'Only your securely assigned licensed counselor.' },
  { icon: 'trash-2', title: 'Your rights', desc: 'Completely delete your data at any point instantly.' },
];

export default function ConsentScreen({ onConsented }) {
  const submitConsent = useSubmitConsent();
  const toast = useToast();
  const { tier } = useResponsive();

  const handleConsent = async () => {
    try {
      await submitConsent.mutateAsync('Mobile App');
      toast.success('Thanks - your consent has been recorded.');
      onConsented();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { maxWidth: authContentWidth[tier], width: '100%', alignSelf: 'center' }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerLabel}>Privacy Consent</Text>
        <Text style={styles.title}>Your Privacy Matters</Text>
        <Text style={styles.subtitle}>
          Please review how Mansakha protects your data. Transparency is our commitment.
        </Text>

        <View style={styles.listContainer}>
          {CONSENT_ITEMS.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.iconCircle}>
                <Feather name={item.icon} size={18} color={THEME.accentIcon} />
              </View>
              <View style={styles.itemTextContainer}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.agreeBanner}>
          <Feather name="check-circle" size={20} color={THEME.textMain} style={{ marginRight: 10 }} />
          <Text style={styles.agreeBannerText}>I understand and agree</Text>
        </View>

        <Pressable 
          style={styles.primaryBtn} 
          onPress={handleConsent} 
          disabled={submitConsent.isPending}
        >
          <Text style={styles.primaryBtnText}>
            {submitConsent.isPending ? 'Saving...' : 'Continue'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  headerLabel: { fontSize: 14, fontWeight: '600', color: THEME.textMuted, textAlign: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: THEME.textMain, marginBottom: 8 },
  subtitle: { fontSize: 13, color: THEME.textMuted, lineHeight: 20, marginBottom: 24 },
  listContainer: { marginBottom: 24 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.accentBlue,
    alignItems: 'center', justifyContent: 'center', marginRight: 14, marginTop: 2,
  },
  itemTextContainer: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: THEME.textMain, marginBottom: 2 },
  itemDesc: { fontSize: 12, color: THEME.textMuted, lineHeight: 18 },
  agreeBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.accentBlue,
    borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#BAE6FD',
  },
  agreeBannerText: { fontSize: 14, fontWeight: '600', color: THEME.textMain },
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});