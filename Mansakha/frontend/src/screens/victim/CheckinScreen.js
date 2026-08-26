import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCheckin, useVictimDashboard } from '../../services/hooks';
import Card from '../../components/Card';
import IconInput from '../../components/IconInput';
import DesktopHeaderActions from '../../components/DesktopHeaderActions';

const DISTRESS_TAGS = [
  { id: 'anxious', label: 'Anxious / Panic', isHighRisk: true },
  { id: 'afraid', label: 'Afraid / Unsafe', isHighRisk: true },
  { id: 'cant_sleep', label: "Can't Sleep", isHighRisk: false },
  { id: 'crying', label: 'Overwhelmed', isHighRisk: false },
  { id: 'hopeless', label: 'Hopeless', isHighRisk: true },
  { id: 'alone', label: 'Isolated / Alone', isHighRisk: false },
  { id: 'calm', label: 'Calm / Safe', isHighRisk: false },
  { id: 'exhausted', label: 'Physically Exhausted', isHighRisk: false },
];

const RATING_SCALE = [
  { value: 1, label: 'Very Low', color: colors.success },
  { value: 2, label: 'Low', color: colors.success },
  { value: 3, label: 'Moderate', color: colors.warning },
  { value: 4, label: 'High', color: colors.error },
  { value: 5, label: 'Critical', color: colors.error },
];

export default function CheckinScreen({ navigation }) {
  const { t } = useLanguage();
  const toast = useToast();
  const checkin = useCheckin();
  const dashboardQuery = useVictimDashboard();
  const { tier, isDesktop } = useResponsive();

  const [distressRating, setDistressRating] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [optionalNote, setOptionalNote] = useState('');
  const [error, setError] = useState(false);

  // Resets the screen inputs back to original blank state whenever focused
  useFocusEffect(
    useCallback(() => {
      setDistressRating(null);
      setSelectedTags([]);
      setOptionalNote('');
      setError(false);
    }, [])
  );

  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const speakGuide = () => {
    Speech.speak("How are you feeling right now? Select your distress level and any keywords that describe your current state.");
  };

  const handleSubmit = async () => {
    if (!distressRating) {
      setError(true);
      toast.error('Please select your current distress level.');
      return;
    }
    setError(false);

    const formattedResponses = [
      `Distress Rating: ${distressRating}/5`,
      `Selected Symptoms: ${selectedTags.length > 0 ? selectedTags.join(', ') : 'None selected'}`,
      optionalNote.trim() ? `Note: ${optionalNote}` : 'No extra notes provided.',
    ];

    try {
      const result = await checkin.mutateAsync({
        channel: 'Mobile App',
        responses: formattedResponses,
      });
      navigation.navigate('CheckinConfirmation', { alertTriggered: result.alertTriggered });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Top Header Banner */}
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="heart" size={20} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="heart" size={28} color={colors.primary} />
              <View style={styles.avatarEditBadge}>
                <Feather name="shield" size={10} color={colors.white} />
              </View>
            </View>
          )}

          <View style={styles.headerInfo}>
            {!isDesktop && (
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>DAILY CHECK-IN</Text>
              </View>
            )}
            <Text style={styles.statusTitle}>Mansakha Care</Text>
            {!isDesktop && <Text style={styles.subtext}>Quick well-being pulse</Text>}
          </View>
        </View>

        <View style={styles.headerRightRow}>
          <Pressable style={styles.speakHeaderBtn} onPress={speakGuide}>
            <Feather name="volume-2" size={18} color={colors.primary} />
          </Pressable>
          {isDesktop && (
            <DesktopHeaderActions
              fullName={dashboardQuery.data?.fullName}
              alertCount={dashboardQuery.data?.alerts?.length || 0}
              onBellPress={() => {}}
            />
          )}
        </View>
      </View>

      {/* Main Body Content */}
      <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {/* Date Ticker */}
        <View style={styles.dateTicker}>
          <Text style={styles.tickerText}>{dayStr}</Text>
          <Text style={[styles.tickerText, styles.tickerTextActive]}>{monthStr}</Text>
          <Text style={styles.tickerText}>{yearStr}</Text>
        </View>

        {/* Question 1: Rating Scale */}
        <Text style={styles.sectionHeaderTitle}>1. HOW DISTRESSED ARE YOU FEELING?</Text>
        <Card style={[styles.customCard, error && !distressRating && styles.cardError]}>
          <Text style={styles.questionSubText}>Select a scale from 1 (Calm) to 5 (Severe Distress)</Text>

          <View style={styles.ratingRow}>
            {RATING_SCALE.map((item) => {
              const isSelected = distressRating === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    setDistressRating(item.value);
                    setError(false);
                  }}
                  style={[
                    styles.ratingBox,
                    isSelected && { backgroundColor: item.color, borderColor: item.color },
                  ]}
                >
                  <Text style={[styles.ratingNumber, isSelected && styles.textWhite]}>
                    {item.value}
                  </Text>
                  <Text style={[styles.ratingLabel, isSelected && styles.textWhite]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Question 2: Chip Tags */}
        <Text style={styles.sectionHeaderTitle}>2. WHAT ARE YOU EXPERIENCING?</Text>
        <Card style={styles.customCard}>
          <Text style={styles.questionSubText}>Tap all words that match how you feel right now</Text>

          <View style={styles.tagsContainer}>
            {DISTRESS_TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTag(tag.id)}
                  style={[
                    styles.tagChip,
                    isSelected && styles.tagChipSelected,
                    isSelected && tag.isHighRisk && styles.tagChipHighRisk,
                  ]}
                >
                  <Feather
                    name={isSelected ? 'check-circle' : 'plus-circle'}
                    size={14}
                    color={isSelected ? colors.white : colors.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.tagChipText, isSelected && styles.textWhite]}>
                    {tag.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Question 3: Optional Text Field */}
        <Text style={styles.sectionHeaderTitle}>3. ANYTHING ELSE ON YOUR MIND? (OPTIONAL)</Text>
        <Card style={styles.customCard}>
          <IconInput
            icon="edit-3"
            value={optionalNote}
            onChangeText={setOptionalNote}
            multiline
            numberOfLines={3}
            placeholder="Type optional thoughts here or leave blank..."
          />
        </Card>

        {/* Submit Action Button */}
        <Pressable
          style={styles.primaryBtn}
          onPress={handleSubmit}
          disabled={checkin.isPending}
        >
          <Feather name="send" size={18} color={colors.white} style={{ marginRight: spacing.xs }} />
          <Text style={styles.primaryBtnText}>
            {checkin.isPending ? 'Submitting...' : 'Submit Check-in'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0, alignItems: 'center' },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  avatarContainerDesktop: { width: 40, height: 40 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    padding: 3,
  },
  headerInfo: { flex: 1 },
  pillBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  speakHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBody: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  contentBodyDesktop: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  dateTicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  tickerText: { ...typography.bodyStrong, color: colors.primary },
  tickerTextActive: { color: colors.error },
  sectionHeaderTitle: {
    ...typography.label,
    color: colors.primaryDark,
    marginBottom: spacing.xs,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  customCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardError: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  questionSubText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingBox: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  ratingNumber: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  ratingLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  tagChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tagChipHighRisk: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  tagChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  textWhite: {
    color: colors.white,
  },
  primaryBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
    ...shadow.card,
  },
  primaryBtnText: { ...typography.bodyStrong, color: colors.white, fontSize: 16 },
});