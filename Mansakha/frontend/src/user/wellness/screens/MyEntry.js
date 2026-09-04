import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Platform } from 'react-native';
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
  const [entryToDelete, setEntryToDelete] = useState(null);

  const runDelete = async (entryId) => {
    try {
      await deleteEntry.mutateAsync(entryId);
      if (selectedEntry?.entryId === entryId) setSelectedEntry(null);
      toast.success('Journal entry deleted.');
    } catch (err) {
      toast.error(err.message || 'Could not delete this entry.');
    }
  };

  const handleDeleteEntry = (entry) => setEntryToDelete(entry);

  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;
    const entryId = entryToDelete.entryId;
    setEntryToDelete(null);
    await runDelete(entryId);
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

      {/* contentArea is the positioning boundary for the entry-detail overlay below -
          it sits under topHeader and to the right of the sidebar automatically,
          since that's already this screen's own layout region. */}
      <View style={styles.contentArea}>
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

      {/* Entry Details - deliberately NOT React Native's <Modal> (which always
          portals to cover the full window, sidebar included, on web). A plain
          conditional View confined to contentArea's own bounds keeps the
          overlay under the top bar and to the right of the sidebar instead. */}
      {!!selectedEntry && (
        <View style={styles.inlineOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelectedEntry(null)} />
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
      )}
      </View>

      {/* Delete Confirmation - same glassmorphism style as GetHelpButton's confirm modal */}
      <Modal
        visible={!!entryToDelete}
        transparent
        animationType="none"
        onRequestClose={() => setEntryToDelete(null)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconTile}>
              <Feather name="trash-2" size={28} color={colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Delete Entry?</Text>
            <Text style={styles.confirmBody}>This cannot be undone.</Text>
            <Pressable style={styles.confirmDeleteBtn} onPress={handleConfirmDelete} disabled={deleteEntry.isPending}>
              <Text style={styles.confirmDeleteBtnText}>{deleteEntry.isPending ? 'Deleting...' : 'Yes, Delete'}</Text>
            </Pressable>
            <Pressable style={styles.confirmCancelBtn} onPress={() => setEntryToDelete(null)} disabled={deleteEntry.isPending}>
              <Text style={styles.confirmCancelBtnText}>Cancel</Text>
            </Pressable>
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
  contentArea: { flex: 1, position: 'relative' },
  // Same glassmorphism recipe as the delete-confirm modal below, so both
  // popups on this screen (and every other popup in the app) read as one
  // consistent style rather than one glass and one flat.
  inlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: spacing.xl,
    zIndex: 50,
    ...Platform.select({
      web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
      default: {},
    }),
  },
  dialogBox: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radius.xxl,
    padding: spacing.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 1)',
    ...Platform.select({
      web: { backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' },
      default: {},
    }),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 10,
  },
  dialogHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  dialogTitle: { ...typography.h3, color: colors.textPrimary, fontWeight: '700' },
  dialogDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: { padding: spacing.xs },
  // showsVerticalScrollIndicator={false} on the ScrollView already hides
  // this on native; react-native-web needs the CSS properties spelled out
  // too, since the browser's own scrollbar isn't governed by that prop.
  dialogBody: {
    marginVertical: spacing.md,
    ...Platform.select({
      web: { scrollbarWidth: 'none', msOverflowStyle: 'none' },
      default: {},
    }),
  },
  dialogContent: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  dialogFooter: { alignItems: 'flex-end', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  closeDialogBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.pill, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.xl },
  closeDialogBtnText: { ...typography.bodyStrong, color: colors.white, fontSize: 13 },

  /* Delete confirmation - glassmorphism, matching GetHelpButton's confirm modal */
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    ...Platform.select({
      web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
      default: {},
    }),
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 1)',
    ...Platform.select({
      web: { backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' },
      default: {},
    }),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 10,
  },
  confirmIconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  confirmTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  confirmBody: { ...typography.bodySmall, color: '#4A4A4A', textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18 },
  confirmDeleteBtn: {
    width: '100%',
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  confirmDeleteBtnText: { ...typography.bodyStrong, color: colors.white },
  confirmCancelBtn: { width: '100%', paddingVertical: spacing.sm, alignItems: 'center' },
  confirmCancelBtnText: { ...typography.bodyStrong, color: '#4A4A4A' },
});