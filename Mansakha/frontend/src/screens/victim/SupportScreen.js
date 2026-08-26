import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ScrollView } from 'react-native';
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
import DesktopHeaderActions from '../../components/DesktopHeaderActions';
import { QueryBoundary } from '../../components/QueryStates';
import { useVictimDashboard } from '../../services/hooks';

const PHONE_PATTERN = /\b\d[\d\s-]{3,}\d\b/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function getLinkInfo(detail) {
  const emailMatch = detail.match(EMAIL_PATTERN);
  if (emailMatch) return { type: 'email', target: emailMatch[0], url: `mailto:${emailMatch[0]}` };
  const phoneMatch = detail.match(PHONE_PATTERN);
  if (phoneMatch) return { type: 'phone', target: phoneMatch[0].replace(/\s|-/g, ''), url: `tel:${phoneMatch[0].replace(/\s|-/g, '')}` };
  return null;
}

export default function SupportScreen() {
  const query = useVictimDashboard();
  const toast = useToast();
  const { tier, isDesktop } = useResponsive();

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

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Header Banner */}
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="phone-call" size={20} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="phone-call" size={28} color={colors.primary} />
              <View style={styles.avatarEditBadge}>
                <Feather name="heart" size={10} color={colors.white} />
              </View>
            </View>
          )}

          <View style={styles.headerInfo}>
            {!isDesktop && (
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>EMERGENCY & AID</Text>
              </View>
            )}
            <Text style={styles.statusTitle}>Support Helpline</Text>
            {!isDesktop && <Text style={styles.subtext}>Connect directly with experts</Text>}
          </View>
        </View>

        {isDesktop && (
          <DesktopHeaderActions
            fullName={query.data?.fullName}
            alertCount={query.data?.alerts?.length || 0}
            onBellPress={() => {}}
          />
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
  statusTitle: { ...typography.h3, color: colors.primaryDark },
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
});