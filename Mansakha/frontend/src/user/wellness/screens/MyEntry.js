import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useJournalEntries, useDeleteJournalEntry } from '../../shared/services/hooks';
import TopRightActions from '../../shared/components/TopRightActions';

export default function MyEntry({ navigation }) {
  const { tier } = useResponsive();
  const toast = useToast();
  const entriesQuery = useJournalEntries();
  const deleteEntry = useDeleteJournalEntry();

  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  const runDelete = async (entryId) => {
    try {
      await deleteEntry.mutateAsync(entryId);
      if (selectedEntry?.entryId === entryId) setSelectedEntry(null);
      toast.success('Journal entry deleted.');
    } catch (err) {
      toast.error(err.message || 'Could not delete this entry.');
    }
  };

  const handleDeleteEntry = (entry) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this entry?')) {
        runDelete(entry.entryId);
      }
      return;
    }
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => runDelete(entry.entryId) },
    ]);
  };

  const filterEntries = (entries) => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => (e.title || '').toLowerCase().includes(q));
  };

  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View style={styles.topHeader}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.primaryDark} />
        </Pressable>
        <View style={styles.headerIconTile}>
          <Feather name="grid" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>My Entries</Text>
          <Text style={styles.subtext}>Browse all your saved journal thoughts</Text>
        </View>
        <TopRightActions showNotifications />
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
          
          {/* Search Bar */}
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

          {/* Grid Box Layout */}
          <QueryBoundary query={entriesQuery} empty={(d) => !d?.entries?.length}>
            {(data) => {
              const filtered = filterEntries(data.entries);

              return (
                <View style={styles.gridContainer}>
                  {/* Google Docs Style "New Entry (+)" Card */}
                  <Pressable
                    style={[styles.boxCard, styles.createCard]}
                    onPress={() => navigation.navigate('Journal')}
                  >
                    <View style={styles.plusIconWrap}>
                      <Feather name="plus" size={28} color={colors.primary} />
                    </View>
                    <Text style={styles.createCardTitle}>New Journal</Text>
                    <Text style={styles.boxDate}>Blank Entry</Text>
                  </Pressable>

                  {/* Existing Saved Entries */}
                  {filtered.map((entry) => (
                    <Pressable
                      key={entry.entryId}
                      style={styles.boxCard}
                      onPress={() => setSelectedEntry(entry)}
                    >
                      <View style={styles.boxHeader}>
                        <View style={styles.boxIconTile}>
                          <Feather name="book-open" size={16} color={colors.primary} />
                        </View>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeleteEntry(entry);
                          }}
                          hitSlop={8}
                        >
                          <Feather name="trash-2" size={15} color={colors.danger} />
                        </Pressable>
                      </View>

                      <Text style={styles.boxTitle} numberOfLines={2}>
                        {entry.title || 'Untitled entry'}
                      </Text>

                      <Text style={styles.boxDate}>
                        {new Date(entry.updatedAt).toLocaleDateString([], {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            }}
          </QueryBoundary>
        </View>
      </ScrollView>

      {/* Entry Details Dialog Box */}
      <Modal
        visible={!!selectedEntry}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelectedEntry(null)} />
          <View style={styles.dialogBox}>
            <View style={styles.dialogHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dialogTitle}>{selectedEntry?.title}</Text>
                <Text style={styles.dialogDate}>
                  {selectedEntry && new Date(selectedEntry.updatedAt).toLocaleString()}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedEntry(null)} hitSlop={8} style={styles.closeBtn}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.dialogBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.dialogContent}>{selectedEntry?.content}</Text>
            </ScrollView>

            <View style={styles.dialogFooter}>
              <Pressable style={styles.closeDialogBtn} onPress={() => setSelectedEntry(null)}>
                <Text style={styles.closeDialogBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark, fontWeight: '700' },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { padding: spacing.xl },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, marginBottom: spacing.xl, height: 42,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: 0 },

  /* Grid Layout Cards */
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  boxCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
    minHeight: 120,
    ...shadow.card,
  },
  
  /* Create New Card Styles */
  createCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  plusIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  createCardTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '700',
  },

  boxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  boxIconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight + '80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginVertical: spacing.xs },
  boxDate: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },

  /* Dialog Box / Pop-up Styles */
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: spacing.xl },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  dialogBox: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    ...shadow.card,
    elevation: 5,
  },
  dialogHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  dialogTitle: { ...typography.h3, color: colors.textPrimary, fontWeight: '700' },
  dialogDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: { padding: spacing.xs },
  dialogBody: { marginVertical: spacing.md },
  dialogContent: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  dialogFooter: { alignItems: 'flex-end', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  closeDialogBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.pill, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.xl },
  closeDialogBtnText: { ...typography.bodyStrong, color: colors.white, fontSize: 13 },
});