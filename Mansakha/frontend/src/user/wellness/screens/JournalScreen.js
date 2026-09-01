import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { useSpeechToText, SPEECH_TO_TEXT_SUPPORTED } from '../../shared/hooks/useSpeechToText';
import Card from '../../shared/components/Card';
import IconInput from '../../shared/components/IconInput';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useJournalEntries, useAddJournalEntry, useUpdateJournalEntry, useDeleteJournalEntry } from '../../shared/services/hooks';
import TopRightActions from '../../shared/components/TopRightActions';

export default function JournalScreen({ navigation }) {
  const { tier } = useResponsive();
  const toast = useToast();
  const entriesQuery = useJournalEntries();
  const addEntry = useAddJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  // null = composing a fresh entry; an entryId = editing that saved entry.
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');

  const isEditing = editingEntryId !== null;
  const saving = addEntry.isPending || updateEntry.isPending;

  // Appends each completed utterance to whatever's already typed, rather
  // than replacing it - so voice and typing can be mixed freely.
  const handleVoiceResult = useCallback((text) => {
    setContent((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
  }, []);
  const speech = useSpeechToText(handleVoiceResult);

  const resetComposer = () => {
    setEditingEntryId(null);
    setTitle('');
    setContent('');
  };

  const handleEditEntry = (entry) => {
    setEditingEntryId(entry.entryId);
    setTitle(entry.title || '');
    setContent(entry.content || '');
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle) {
      toast.error('Give your entry a title.');
      return;
    }
    if (!trimmedContent) {
      toast.error('Write something before saving.');
      return;
    }
    try {
      if (isEditing) {
        await updateEntry.mutateAsync({ entryId: editingEntryId, title: trimmedTitle, content: trimmedContent });
        toast.success('Journal entry updated.');
      } else {
        await addEntry.mutateAsync({ title: trimmedTitle, content: trimmedContent });
        toast.success('Journal entry saved.');
      }
      resetComposer();
    } catch (err) {
      toast.error(err.message || 'Could not save your entry.');
    }
  };

  const runDelete = async (entry) => {
    try {
      await deleteEntry.mutateAsync(entry.entryId);
      if (editingEntryId === entry.entryId) resetComposer();
      toast.success('Journal entry deleted.');
    } catch (err) {
      toast.error(err.message || 'Could not delete this entry.');
    }
  };

  const handleDeleteEntry = (entry) => {
    // Alert.alert is the standard RN confirm pattern (no window.confirm on
    // native) - but this app also runs via `expo start --web`, where
    // react-native-web's Alert.alert is a documented no-op. window.confirm
    // there is a real browser primitive, not a custom modal, so this stays a
    // one-line Platform branch instead of building any UI of our own.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this entry? This cannot be undone.')) {
        runDelete(entry);
      }
      return;
    }
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => runDelete(entry) },
    ]);
  };

  const filterEntries = (entries) => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => (e.title || '').toLowerCase().includes(q));
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
          {isEditing && (
            <View style={styles.editingBanner}>
              <Feather name="edit-2" size={14} color={colors.primary} />
              <Text style={styles.editingBannerText}>Editing a saved entry</Text>
              <Pressable onPress={resetComposer} hitSlop={8}>
                <Text style={styles.editingCancelText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          <IconInput icon="edit-3" placeholder="Title" value={title} onChangeText={setTitle} />

          <View style={styles.storyLabelRow}>
            <Text style={styles.storyLabel}>Story</Text>
            {SPEECH_TO_TEXT_SUPPORTED && (
              <Pressable onPress={speech.toggle} style={[styles.micPill, speech.listening && styles.micPillActive]}>
                <Feather name="mic" size={13} color={speech.listening ? colors.white : colors.primary} />
                <Text style={[styles.micPillText, speech.listening && styles.micPillTextActive]}>
                  {speech.listening ? 'Listening...' : 'Voice input'}
                </Text>
              </Pressable>
            )}
          </View>

          <TextInput
            style={styles.textArea}
            placeholder="Write about how you're feeling today..."
            placeholderTextColor={colors.textSecondary}
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={5}
          />

          <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving || !title.trim() || !content.trim()}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Entry'}</Text>
          </Pressable>
        </Card>

        <Text style={styles.sectionHeaderTitle}>PAST ENTRIES</Text>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search entries by title..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <QueryBoundary query={entriesQuery} empty={(d) => !d?.entries?.length}>
          {(data) => {
            const filtered = filterEntries(data.entries);
            if (!filtered.length) {
              return (
                <View style={styles.noResults}>
                  <Text style={styles.noResultsText}>No entries match "{search}".</Text>
                </View>
              );
            }
            return (
              <View style={{ gap: spacing.md }}>
                {filtered.map((entry) => (
                  <Card key={entry.entryId} style={styles.entryCard}>
                    <View style={styles.entryCardRow}>
                      <Pressable style={{ flex: 1 }} onPress={() => handleEditEntry(entry)}>
                        <Text style={styles.entryTitle} numberOfLines={1}>{entry.title || 'Untitled entry'}</Text>
                        <Text style={styles.entryDate}>{new Date(entry.updatedAt).toLocaleString()}</Text>
                        <Text style={styles.entryText} numberOfLines={3}>{entry.content}</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteEntry(entry)} hitSlop={8} style={styles.deleteBtn}>
                        <Feather name="trash-2" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
            );
          }}
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
  editingBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight,
    borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, marginBottom: spacing.md,
  },
  editingBannerText: { ...typography.caption, color: colors.primaryDark, fontWeight: '700', marginLeft: spacing.xs, flex: 1 },
  editingCancelText: { ...typography.caption, color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  storyLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  storyLabel: { ...typography.label, color: colors.textSecondary, letterSpacing: 1 },
  micPill: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary,
    borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: spacing.sm,
  },
  micPillActive: { backgroundColor: colors.primary },
  micPillText: { ...typography.caption, color: colors.primary, fontWeight: '700', marginLeft: 4 },
  micPillTextActive: { color: colors.white },
  textArea: {
    ...typography.body, color: colors.textPrimary, minHeight: 110, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  saveBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  saveBtnText: { ...typography.bodyStrong, color: colors.white },
  sectionHeaderTitle: { ...typography.label, color: colors.primaryDark, marginBottom: spacing.md, letterSpacing: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, marginBottom: spacing.lg,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: spacing.sm },
  noResults: { alignItems: 'center', paddingVertical: spacing.xl },
  noResultsText: { ...typography.body, color: colors.textSecondary },
  entryCard: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  entryCardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.sm },
  entryTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  entryDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.xs },
  entryText: { ...typography.body, color: colors.textPrimary },
});
