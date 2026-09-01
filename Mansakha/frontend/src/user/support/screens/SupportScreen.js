import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ScrollView, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import AssignedCounsellorCard from '../../shared/components/AssignedCounsellorCard';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useAssignedCounsellor, useUpdateCounsellorPreference } from '../../shared/services/hooks';

const PHONE_PATTERN = /\b\d[\d\s-]{3,}\d\b/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function getLinkInfo(detail) {
  const emailMatch = detail.match(EMAIL_PATTERN);
  if (emailMatch) return { type: 'email', target: emailMatch[0], url: `mailto:${emailMatch[0]}` };
  const phoneMatch = detail.match(PHONE_PATTERN);
  if (phoneMatch) return { type: 'phone', target: phoneMatch[0].replace(/\s|-/g, ''), url: `tel:${phoneMatch[0].replace(/\s|-/g, '')}` };
  return null;
}

export default function SupportScreen({ navigation }) {
  const query = useUserDashboard();
  const assignedCounsellorQuery = useAssignedCounsellor();
  const updateCounsellorPreference = useUpdateCounsellorPreference();
  const toast = useToast();
  const { tier, isDesktop } = useResponsive();

  // Same three states SettingsScreen.js already handles for this preference -
  // see its own comment: the backend shape is
  // { assigned, counsellor: {fullName, phone, whatsappNumber} | null }, never
  // a top-level officialId/phone.
  const optedForCounsellor = query.data?.optedForManualCounsellor ?? false;
  const hasAssignedCounsellor = !!assignedCounsellorQuery.data?.assigned;
  const counsellor = assignedCounsellorQuery.data?.counsellor;

  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  const openLink = async (url) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      toast.error('Could not open that link on this device.');
    }
  };

  const handleToggleCounsellorPreference = async (value) => {
    try {
      await updateCounsellorPreference.mutateAsync(value);
      await Promise.all([assignedCounsellorQuery.refetch(), query.refetch()]);
      toast.success(value ? 'Assigned to a human counsellor.' : 'Counsellor preference updated.');
    } catch (err) {
      toast.error(err.message || 'Could not update this preference.');
    }
  };

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Header Banner */}
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="file-text" size={24} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="file-text" size={28} color={colors.primary} />
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={styles.pageTitle}>Support</Text>
          </View>
        </View>

        {isDesktop ? (
          <DesktopHeaderActions
            fullName={query.data?.fullName}
            alertCount={query.data?.alerts?.length || 0}
            onBellPress={() => {}}
          />
        ) : (
          <TopRightActions />
        )}
      </View>

      {/* Main Content Area */}
      <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {/* Date Ticker */}
        <View style={styles.dateTicker}>
          <Text style={styles.tickerText}>{dayStr}</Text>
          <Text style={[styles.tickerText, styles.tickerTextActive]}>{monthStr}</Text>
          <Text style={styles.tickerText}>{yearStr}</Text>
        </View>

        <Text style={styles.sectionHeaderTitle}>REACH OUT DIRECTLY</Text>

        <QueryBoundary query={query}>
          {(data) => (
            <View style={styles.cardsWrapper}>
              {data.supportLinks.map((link) => {
                const linkInfo = getLinkInfo(link.detail);
                const icon =
                  linkInfo?.type === 'phone'
                    ? 'phone'
                    : linkInfo?.type === 'email'
                    ? 'mail'
                    : 'life-buoy';

                const cardContent = (
                  <View style={styles.row}>
                    <View style={styles.iconTile}>
                      <Feather name={icon} size={20} color={colors.primary} />
                    </View>
                    <View style={styles.textWrap}>
                      <Text style={styles.label}>{link.label}</Text>
                      <Text style={styles.detail}>{link.detail}</Text>
                    </View>
                    {linkInfo && <Feather name="external-link" size={16} color={colors.textSecondary} />}
                  </View>
                );

                return (
                  <Card key={link.label} style={styles.card}>
                    {linkInfo ? (
                      <Pressable
                        onPress={() => openLink(linkInfo.url)}
                        accessibilityRole="link"
                        accessibilityLabel={`${linkInfo.type === 'phone' ? 'Call' : 'Email'} ${link.label}`}
                      >
                        {cardContent}
                      </Pressable>
                    ) : (
                      cardContent
                    )}
                  </Card>
                );
              })}
            </View>
          )}
        </QueryBoundary>

        {/* Feature Catalog Section 1.4 - counsellor-connect functionality that
            previously only existed in Settings, brought here so a user
            looking for help doesn't have to go elsewhere to find it. */}
        <Text style={[styles.sectionHeaderTitle, { marginTop: spacing.lg }]}>TALK TO A COUNSELLOR</Text>

        {!optedForCounsellor && (
          <Card style={[styles.card, styles.inviteCard]}>
            <Feather name="user-plus" size={20} color={colors.primary} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.label}>Want to talk to someone?</Text>
            <Text style={styles.detail}>
              Opt in below to get matched with a real counsellor you can message, call, or reach on WhatsApp directly.
            </Text>
            <View style={styles.inviteToggleRow}>
              <Text style={styles.inviteToggleLabel}>Prefer a human counsellor</Text>
              <Switch
                value={optedForCounsellor}
                onValueChange={handleToggleCounsellorPreference}
                disabled={updateCounsellorPreference.isPending}
                trackColor={{ true: colors.primary }}
              />
            </View>
          </Card>
        )}

        {optedForCounsellor && !hasAssignedCounsellor && (
          <Card style={[styles.card, styles.inviteCard]}>
            <Feather name="clock" size={20} color={colors.primary} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.label}>Finding you a counsellor</Text>
            <Text style={styles.detail}>
              You're opted in - we'll connect you with a counsellor as soon as one is available in your area.
            </Text>
          </Card>
        )}

        {optedForCounsellor && hasAssignedCounsellor && (
          <AssignedCounsellorCard counsellor={counsellor} navigation={navigation} />
        )}
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
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
  subtext: { ...typography.caption, color: colors.textSecondary },
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
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  cardsWrapper: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textWrap: { flex: 1 },
  label: { ...typography.bodyStrong, color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  inviteCard: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  inviteToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inviteToggleLabel: { ...typography.bodyStrong, color: colors.textPrimary },
});