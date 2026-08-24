import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { useLanguage } from '../../context/LanguageContext';
import { LANGUAGES, translate } from '../../i18n/strings';
import AuthLayout from '../../components/AuthLayout';
import Button from '../../components/Button';

// The Victim App's actual first screen (Build Prompt Section 8's Screen
// Inventory) - never built until now (Section 4.1's "languages table isn't
// a hardcoded set" requirement existed as data only, with no picker
// anywhere). Shown once via LanguageGate; reachable again from Settings.
export default function LanguageSelectScreen({ onSelected }) {
  const { setLanguage } = useLanguage();
  const [selected, setSelected] = useState('en');

  const handleContinue = async () => {
    await setLanguage(selected);
    onSelected();
  };

  return (
    <AuthLayout
      title={translate(selected, 'languageSelectTitle')}
      subtitle={translate(selected, 'languageSelectSubtitle')}
    >
      <View style={styles.grid}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === selected;
          return (
            <Pressable key={lang.code} style={[styles.tile, active && styles.tileActive]} onPress={() => setSelected(lang.code)}>
              <Text style={[styles.tileText, active && styles.tileTextActive]}>{lang.name}</Text>
              {active && <Feather name="check-circle" size={16} color={colors.primary} style={styles.checkIcon} />}
            </Pressable>
          );
        })}
      </View>
      <Button title={translate(selected, 'continueLabel')} icon="arrow-right" onPress={handleContinue} style={styles.continueButton} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, width: '48%',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.white,
  },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  tileText: { ...typography.bodyStrong, color: colors.textPrimary },
  tileTextActive: { color: colors.primaryDark },
  checkIcon: { marginLeft: 'auto' },
  continueButton: { width: '100%', marginTop: spacing.xs },
});
