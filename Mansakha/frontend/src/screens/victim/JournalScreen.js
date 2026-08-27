import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../context/ToastContext';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import Card from '../../components/Card';
import { QueryBoundary } from '../../components/QueryStates';
import { useJournalEntries, useAddJournalEntry } from '../../services/hooks';
import TopRightActions from '../../components/TopRightActions';

export default function JournalScreen({ navigation }) {
  const { tier } = useResponsive();
  const toast = useToast();
  const entriesQuery = useJournalEntries();
  const addEntry = useAddJournalEntry();
  const [draft, setDraft] = useState('');

  const handleSave = async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      await addEntry.mutateAsync(content);
      setDraft('');
      toast.success('Journal entry saved.');
    } catch (err) {
      toast.error(err.message || 'Could not save your entry.');
    }
  };

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      <View style={styles.topHeader}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.primaryDark} />
        </Pressable>
        <View style={styles.headerIconTile}>
          <Feather name="book-open" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>My Journal</Text>
          <Text style={styles.subtext}>A private space for your thoughts</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        <Card style={styles.composerCard}>
          <TextInput
            style={styles.textArea}
            placeholder="Write about how you're feeling today..."
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
            numberOfLines={5}
          />
          <Pressable style={styles.saveBtn} onPress={handleSave} disabled={addEntry.isPending || !draft.trim()}>
            <Text style={styles.saveBtnText}>{addEntry.isPending ? 'Saving...' : 'Save Entry'}</Text>
          </Pressable>
        </Card>

        <Text style={styles.sectionHeaderTitle}>PAST ENTRIES</Text>
        <QueryBoundary query={entriesQuery} empty={(d) => !d?.entries?.length}>
          {(data) => (
            <View style={{ gap: spacing.md }}>
              {data.entries.map((entry) => (
                <Card key={entry.entryId} style={styles.entryCard}>
                  <Text style={styles.entryDate}>{new Date(entry.createdAt).toLocaleString()}</Text>
                  <Text style={styles.entryText}>{entry.content}</Text>
                </Card>
              ))}
            </View>
          )}
        </QueryBoundary>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { padding: spacing.lg },
  composerCard: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl, ...shadow.card },
  textArea: {
    ...typography.body, color: colors.textPrimary, minHeight: 110, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  saveBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  saveBtnText: { ...typography.bodyStrong, color: colors.white },
  sectionHeaderTitle: { ...typography.label, color: colors.primaryDark, marginBottom: spacing.md, letterSpacing: 1 },
  entryCard: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  entryDate: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  entryText: { ...typography.body, color: colors.textPrimary },
});
