import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../shared/context/LanguageContext';
import { LANGUAGES, translate } from '../../shared/i18n/strings';
import { authContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Dropdown from '../../shared/components/Dropdown';

// A dropdown rather than a tile grid - this list already stands at 6 and is
// headed to all 22 Eighth Schedule languages, where a grid would sprawl
// into a dozen-plus rows. A dropdown stays a single control at any size.
const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({ value: lang.code, label: lang.name }));

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

      <View style={styles.dropdownWrap}>
        <Dropdown
          options={LANGUAGE_OPTIONS}
          value={selected}
          onChange={setSelected}
          placeholder="Select a language"
        />
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
  dropdownWrap: { marginBottom: 20 },
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});