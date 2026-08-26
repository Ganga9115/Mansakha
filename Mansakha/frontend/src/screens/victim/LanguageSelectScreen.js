import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../context/LanguageContext';
import { LANGUAGES, translate } from '../../i18n/strings';
import { authContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';

const THEME = {
  bg: '#F8F9FD',
  cardBg: '#FFFFFF',
  textMain: '#0F172A',
  textMuted: '#64748B',
  accentBlue: '#E0F2FE',
  accentIcon: '#0284C7',
  primaryDark: '#0F172A',
  border: '#E2E8F0',
};

export default function LanguageSelectScreen({ onSelected }) {
  const { setLanguage } = useLanguage();
  const { tier } = useResponsive();
  const [selected, setSelected] = useState('en');

  const handleContinue = async () => {
    await setLanguage(selected);
    onSelected();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { maxWidth: authContentWidth[tier], width: '100%', alignSelf: 'center' }]}
    >
      <Text style={styles.headerTitle}>Choose Language</Text>
      
      <Text style={styles.mainTitle}>{translate(selected, 'languageSelectTitle')}</Text>
      <Text style={styles.subtitle}>{translate(selected, 'languageSelectSubtitle')}</Text>

      <View style={styles.grid}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === selected;
          return (
            <Pressable
              key={lang.code}
              style={[styles.tile, active && styles.tileActive]}
              onPress={() => setSelected(lang.code)}
            >
              <View style={styles.tileTextWrap}>
                <Text style={[styles.tileText, active && styles.tileTextActive]}>{lang.name}</Text>
                <Text style={styles.tileSubtext}>{lang.code.toUpperCase()}</Text>
              </View>
              {active && (
                <View style={styles.checkCircle}>
                  <Feather name="check" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.primaryBtn} onPress={handleContinue}>
        <Text style={styles.primaryBtnText}>{translate(selected, 'continueLabel')}</Text>
        <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { padding: 24, paddingTop: 40, paddingBottom: 40 },
  headerTitle: { fontSize: 14, fontWeight: '600', color: THEME.textMuted, textAlign: 'center', marginBottom: 28 },
  mainTitle: { fontSize: 24, fontWeight: '700', color: THEME.textMain, marginBottom: 6 },
  subtitle: { fontSize: 13, color: THEME.textMuted, lineHeight: 18, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  tile: {
    width: '48%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: THEME.border, borderRadius: 16, padding: 16, backgroundColor: THEME.cardBg,
  },
  tileActive: { borderColor: THEME.accentIcon, backgroundColor: THEME.accentBlue },
  tileTextWrap: { flex: 1 },
  tileText: { fontSize: 16, fontWeight: '700', color: THEME.textMain },
  tileTextActive: { color: THEME.primaryDark },
  tileSubtext: { fontSize: 11, color: THEME.textMuted, marginTop: 2 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: THEME.accentIcon, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});