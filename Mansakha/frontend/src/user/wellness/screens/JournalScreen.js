import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform } from 'react-native';
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
import { useSpeechToText, SPEECH_TO_TEXT_SUPPORTED } from '../../shared/hooks/useSpeechToText';
import { useAddJournalEntry, useUserDashboard } from '../../shared/services/hooks';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import JournalIllustration from '../../shared/components/JournalIllustration';
import BottomNavBar from '../../shared/components/BottomNavBar';

export default function JournalScreen({ navigation }) {
  const { tier, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const addEntry = useAddJournalEntry();

  // Fetch user profile data for DesktopHeaderActions
  const dashboardQuery = useUserDashboard();
  const userData = dashboardQuery.data;

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

  // Voice input button rendered next to Save Entry on both web and mobile views.
  const voiceInputButton = SPEECH_TO_TEXT_SUPPORTED ? (
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
  ) : null;

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
      {/* Top Navigation Header */}
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconTile}>
            <Feather name="book-open" size={22} color={colors.primaryDark} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>My Journal</Text>
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
              {voiceInputButton}
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

      {!isDesktop && <BottomNavBar currentTab="Wellness" navigation={navigation} />}
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
  // Clearance for the floating BottomNavBar so Save Entry isn't covered.
  bodyMobile: { paddingBottom: 100 },
  heroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight + '60',
    borderRadius: radius.xxl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLeft: { flex: 1, paddingRight: spacing.md },
  featherIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroTitle: { ...typography.h2, color: colors.primaryDark, fontSize: 20, fontWeight: '800' },
  heroSubtext: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  heroIllustrationContainer: { justifyContent: 'center', alignItems: 'center' },

  composerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
    ...shadow.card,
  },
  titleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    height: 46,
  },
  titleTextInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: 0 },
  micPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  micPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  micPillText: { ...typography.caption, color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  micPillTextActive: { color: colors.white },

  textArea: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 140,
    textAlignVertical: 'top',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  composerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  saveBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.bodyStrong, color: colors.white, fontWeight: '700', fontSize: 14 },
});