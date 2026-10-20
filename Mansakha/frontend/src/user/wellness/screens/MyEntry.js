import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useJournalEntries, useDeleteJournalEntry, useUpdateJournalEntry, useUserDashboard } from '../../shared/services/hooks';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import BottomNavBar from '../../shared/components/BottomNavBar';

// react-native-web's <Modal> portals to document.body, which is exactly
// why it already centers correctly there - so web keeps using it,
// unchanged. On native, a newer react-native-screens version is confining
// Modal's own native window to the host screen's Fragment bounds instead of
// the true device window (confirmed live: the overlay was only as tall as
// the underlying screen's visible content, not the full screen), so native
// renders a plain in-tree absolutely-positioned View instead - no native
// portal involved, so there's no window/Fragment ambiguity to hit.
function DialogPortal({ visible, onRequestClose, children }) {
  if (Platform.OS === 'web') {
    return (
      <Modal visible={visible} transparent animationType="none" onRequestClose={onRequestClose}>
        {children}
      </Modal>
    );
  }
  if (!visible) return null;
  return children;
}

export default function MyEntry({ navigation }) {
  const { tier, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const entriesQuery = useJournalEntries();
  const deleteEntry = useDeleteJournalEntry();
  const updateEntry = useUpdateJournalEntry();

  // Fetch user profile data to match WellnessScreen header structure
  const dashboardQuery = useUserDashboard();
  const userData = dashboardQuery.data;

  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [entryToEdit, setEntryToEdit] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

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

  const handleOpenEdit = (entry) => {
    setEntryToEdit(entry);
    setEditTitle(entry.title || '');
    setEditContent(entry.content || '');
  };

  const handleSaveEdit = async () => {
    if (!entryToEdit) return;
    try {
      await updateEntry.mutateAsync({
        entryId: entryToEdit.entryId,
        title: editTitle,
        content: editContent,
      });
      toast.success('Journal entry updated.');
      setEntryToEdit(null);
    } catch (err) {
      toast.error(err.message || 'Could not update this entry.');
    }
  };

  const filterEntries = (entries) => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => (e.title || '').toLowerCase().includes(q));
  };

  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconTile}>
            <Feather name="layout" size={22} color={colors.primaryDark} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>My Entries</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={userData?.fullName}
              alertCount={userData?.alerts?.length || 0}
              onBellPress={() => {}}
            />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={[styles.body, !isDesktop && styles.bodyMobile, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>

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
                        <View style={styles.boxActionsRow}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(entry);
                            }}
                            hitSlop={8}
                            style={styles.actionIconBtn}
                          >
                            <Feather name="edit-2" size={14} color={colors.primary} />
                          </Pressable>
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

      {!isDesktop && <BottomNavBar currentTab="Wellness" navigation={navigation} />}

      {/* Entry Details Modal */}
      <DialogPortal visible={!!selectedEntry} onRequestClose={() => setSelectedEntry(null)}>
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
      </DialogPortal>

      {/* Edit Entry Modal */}
      <DialogPortal visible={!!entryToEdit} onRequestClose={() => setEntryToEdit(null)}>
        <View style={styles.inlineOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEntryToEdit(null)} />
          <View style={styles.dialogBox}>
            <View style={styles.dialogHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dialogTitle}>Edit Journal Entry</Text>
              </View>
              <Pressable onPress={() => setEntryToEdit(null)} hitSlop={8} style={styles.closeBtn}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.dialogBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.editLabel}>Title</Text>
              <TextInput
                style={styles.editTitleInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Entry Title"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.editLabel}>Content</Text>
              <TextInput
                style={styles.editContentInput}
                value={editContent}
                onChangeText={setEditContent}
                placeholder="Write your thoughts here..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={6}
              />
            </ScrollView>

            <View style={styles.dialogFooterEdit}>
              <Pressable style={styles.cancelEditBtn} onPress={() => setEntryToEdit(null)} disabled={updateEntry.isPending}>
                <Text style={styles.cancelEditBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveEditBtn} onPress={handleSaveEdit} disabled={updateEntry.isPending}>
                <Text style={styles.saveEditBtnText}>{updateEntry.isPending ? 'Saving...' : 'Save Changes'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </DialogPortal>

      {/* Delete Confirmation Modal */}
      <DialogPortal visible={!!entryToDelete} onRequestClose={() => setEntryToDelete(null)}>
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
      </DialogPortal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: {
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  headerIconTile: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  statusTitle: {
    ...typography.h1,
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '700',
  },
  body: { padding: spacing.xl },
  bodyMobile: { paddingBottom: 100 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    height: 42,
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
  boxActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionIconBtn: {
    padding: 2,
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

  /* Edit Modal specifics */
  editLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', marginBottom: spacing.xs },
  editTitleInput: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  editContentInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  dialogFooterEdit: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelEditBtn: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  cancelEditBtnText: { ...typography.bodyStrong, color: colors.textSecondary },
  saveEditBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xl,
  },
  saveEditBtnText: { ...typography.bodyStrong, color: colors.white, fontSize: 13 },

  /* Delete confirmation */
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    zIndex: 50,
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