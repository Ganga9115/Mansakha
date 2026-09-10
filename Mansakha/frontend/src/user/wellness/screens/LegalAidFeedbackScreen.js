import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Button from '../../shared/components/Button';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { useUserDashboard, useSubmitLegalAidHearingFeedback } from '../../shared/services/hooks';

// "Feedback" - rating + optional comment for one specific hearing (never a
// whole-case average), reached from the Assigned Representative screen's own
// hearing row. A poor rating routes to DLSA for review; it never
// auto-reassigns the representative on its own.

const STARS = [1, 2, 3, 4, 5];

function StarRating({ value, onChange }) {
  return (
    <View style={styles.starRow}>
      {STARS.map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
          <Feather name="star" size={30} color={n <= value ? colors.warning || '#F5A623' : colors.border} />
        </Pressable>
      ))}
    </View>
  );
}

export default function LegalAidFeedbackScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const { requestId, hearingId } = route?.params || {};

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const submitFeedback = useSubmitLegalAidHearingFeedback(requestId);

  const handleSubmit = async () => {
    if (!rating) return;
    setError(null);
    try {
      await submitFeedback.mutateAsync({ hearingId, rating, comment: comment.trim() || undefined });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not submit feedback.');
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          {!isDesktop && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          <View style={styles.headerIconTile}>
            <Feather name="star" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Feedback</Text>
        </View>
        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions fullName={dashboardQuery.data?.fullName} alertCount={dashboardQuery.data?.alerts?.length || 0} onBellPress={() => {}} />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          {!requestId || !hearingId ? (
            <Card><Text style={styles.pendingText}>This feedback link is no longer valid.</Text></Card>
          ) : submitted ? (
            <Card>
              <View style={styles.thanksRow}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={styles.thanksText}>Thank you - your feedback has been recorded.</Text>
              </View>
              <Button title="Back to Representative" onPress={() => navigation.navigate('LegalAidRepresentative')} style={{ marginTop: spacing.md }} />
            </Card>
          ) : (
            <Card>
              <Text style={styles.cardTitle}>Rate this hearing</Text>
              <Text style={styles.introText}>Your feedback helps DLSA ensure you are being properly represented.</Text>
              <StarRating value={rating} onChange={setRating} />
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Optional comments..."
                placeholderTextColor={colors.textSecondary}
                value={comment}
                onChangeText={setComment}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button title="Submit Feedback" onPress={handleSubmit} loading={submitFeedback.isPending} disabled={!rating || submitFeedback.isPending} />
            </Card>
          )}
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
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  headerTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 20, fontWeight: '700' },
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 720, alignSelf: 'center' },

  pendingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, marginBottom: spacing.xs },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    minHeight: 80, textAlignVertical: 'top', color: colors.textPrimary, marginBottom: spacing.md, ...typography.bodySmall,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md },
  starRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  thanksRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thanksText: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },
});
