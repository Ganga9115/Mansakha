import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
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
import { useAddJournalEntry } from '../../shared/services/hooks';
import TopRightActions from '../../shared/components/TopRightActions';
import JournalIllustration from '../../shared/components/JournalIllustration';

export default function JournalScreen({ navigation }) {
  const { tier } = useResponsive();
  const toast = useToast();
  const addEntry = useAddJournalEntry();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const saving = addEntry.isPending;

  const handleVoiceResult = useCallback((text) => {
    setContent((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
  }, []);
  const speech = useSpeechToText(handleVoiceResult);

  const resetComposer = () => {
    setTitle('');
    setContent('');
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
      await addEntry.mutateAsync({ title: trimmedTitle, content: trimmedContent });
      toast.success('Journal entry saved.');
      resetComposer();
    } catch (err) {
      toast.error(err.message || 'Could not save your entry.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
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

        <TopRightActions showNotifications />
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
          
          {/* My Entries Button Row Below Header */}
          <View style={styles.subHeaderRow}>
            <Pressable
              style={styles.myEntriesBtn}
              onPress={() => navigation.navigate('MyEntry')}
            >
              <Feather name="grid" size={15} color={colors.white} />
              <Text style={styles.myEntriesBtnText}>My Entries</Text>
            </Pressable>
          </View>

          {/* Decorative Hero Banner */}
          <View style={styles.heroBanner}>
            <View style={styles.heroLeft}>
              <View style={styles.featherIconBadge}>
                <Feather name="feather" size={20} color={colors.primaryDark} />
              </View>
              <Text style={styles.heroTitle}>Write in your journal</Text>
              <Text style={styles.heroSubtext}>Express yourself freely. Your thoughts matter.</Text>
            </View>
            <View style={styles.heroIllustrationContainer}>
              <JournalIllustration width={140} height={95} />
            </View>
          </View>

          {/* Composer Card */}
          <View style={styles.composerCard}>
            <View style={styles.titleInputRow}>
              <Feather name="edit-3" size={18} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
              <TextInput
                style={styles.titleTextInput}
                placeholder="Give your entry a title..."
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />
              {SPEECH_TO_TEXT_SUPPORTED && (
                <Pressable
                  onPress={speech.toggle}
                  style={[styles.micPill, speech.listening && styles.micPillActive]}
                >
                  <Feather
                    name={speech.listening ? "mic-off" : "mic"}
                    size={13}
                    color={speech.listening ? colors.white : colors.primary}
                  />
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
              numberOfLines={8}
            />

            <View style={styles.composerBottomRow}>
              <Pressable
                style={[
                  styles.saveBtn,
                  (!title.trim() || !content.trim() || saving) && styles.saveBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={saving || !title.trim() || !content.trim()}
              >
                <Feather name="feather" size={16} color={colors.white} style={{ marginRight: spacing.xs }} />
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving...' : 'Save Entry'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
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
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  myEntriesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
  },
  myEntriesBtnText: { ...typography.caption, color: colors.white, fontWeight: '700' },

  body: { padding: spacing.xl },
  heroBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryLight + '60', borderRadius: radius.xxl,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  heroLeft: { flex: 1, paddingRight: spacing.md },
  featherIconBadge: {
    width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  heroTitle: { ...typography.h2, color: colors.primaryDark, fontSize: 20, fontWeight: '800' },
  heroSubtext: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  heroIllustrationContainer: { justifyContent: 'center', alignItems: 'center' },

  composerCard: {
    backgroundColor: colors.surface, borderRadius: radius.xxl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xxl, ...shadow.card,
  },
  titleInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.md, height: 46,
  },
  titleTextInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: 0 },
  micPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingVertical: 4, paddingHorizontal: spacing.md, gap: 4,
  },
  micPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  micPillText: { ...typography.caption, color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  micPillTextActive: { color: colors.white },

  textArea: {
    ...typography.body, color: colors.textPrimary, minHeight: 140, textAlignVertical: 'top',
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.lg, lineHeight: 20,
  },
  composerBottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
  },

  saveBtn: {
    backgroundColor: colors.primaryDark, borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.bodyStrong, color: colors.white, fontWeight: '700', fontSize: 14 },
});