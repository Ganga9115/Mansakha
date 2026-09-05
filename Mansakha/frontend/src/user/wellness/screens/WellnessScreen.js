import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { dashboardContentWidth } from '../../shared/theme/layout';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import BottomNavBar from '../../shared/components/BottomNavBar';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useWellnessSuggestions, useUserDashboard } from '../../shared/services/hooks';
import JournalIllustration from '../../shared/components/JournalIllustration';
import { MeditationList, MeditationPlayer, findExerciseAnimation, findExerciseTeaser } from '../components/GuidedMeditations';

const SEGMENTS = [
  { value: 'exercise', label: 'Exercise', icon: 'activity' },
  { value: 'meditation', label: 'Meditation', icon: 'user' },
  { value: 'music', label: 'Music', icon: 'music' },
];

function getExerciseIcon(title = '', category = '') {
  if (category === 'music') return 'music';
  if (category === 'meditation') return 'wind';
  
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('neck') || lowerTitle.includes('shoulder')) {
    return 'user';
  }
  if (lowerTitle.includes('walk') || lowerTitle.includes('step')) {
    return 'navigation';
  }
  if (lowerTitle.includes('muscle') || lowerTitle.includes('relaxation') || lowerTitle.includes('stretch')) {
    return 'smile';
  }
  return 'activity';
}

function ContentList({ category, onOpenTechnique }) {
  const query = useWellnessSuggestions(category);
  const toast = useToast();

  return (
    <QueryBoundary query={query} empty={(d) => !d?.suggestions?.length}>
      {(data) => (
        <View style={styles.contentListGap}>
          {data.suggestions.map((item) => {
            const iconName = getExerciseIcon(item.title, category);
            // Real physical exercises whose title matches one of our animated
            // techniques open the same full-screen animated player Meditation
            // uses, instead of just linking out.
            const AnimationComponent = category === 'exercise' ? findExerciseAnimation(item.title) : null;
            // The backend only stores one long instructional paragraph per
            // item - showing that whole thing as the card preview reads much
            // denser than every other card in the app, so a short frontend
            // teaser stands in on the card while the real text still shows
            // once the exercise is opened.
            const cardPreviewText = (category === 'exercise' && findExerciseTeaser(item.title)) || item.body;

            return (
              <Pressable
                key={item.contentId}
                style={styles.contentCard}
                onPress={() => {
                  if (AnimationComponent) {
                    onOpenTechnique({ title: item.title, instructions: item.body || item.title, icon: iconName, duration: item.duration, Component: AnimationComponent });
                  } else if (item.url) {
                    Linking.openURL(item.url).catch(() => toast.error('Could not open link.'));
                  }
                }}
              >
                <View style={styles.cardMainRow}>
                  <View style={styles.itemIconTile}>
                    <Feather name={iconName} size={22} color={colors.primary} />
                  </View>

                  <View style={styles.itemTextContainer}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {!!cardPreviewText && <Text style={styles.itemBody}>{cardPreviewText}</Text>}
                  </View>

                  {item.duration && (
                    <View style={styles.durationPill}>
                      <Feather name="clock" size={11} color={colors.primary} />
                      <Text style={styles.durationPillText}>{item.duration}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </QueryBoundary>
  );
}

export default function WellnessScreen({ navigation }) {
  const { tier, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState('exercise');
  const [openedTechnique, setOpenedTechnique] = useState(null);

  // Fetch user profile data just like HomeScreen does
  const dashboardQuery = useUserDashboard();
  const userData = dashboardQuery.data;

  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconTile}>
            <Feather name="sun" size={22} color={colors.primaryDark} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>My Well-being</Text>
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

      {openedTechnique ? (
        // A real screen swap (a sibling of the tab-browsing ScrollView below,
        // not nested inside it) rather than a Modal - a Modal would portal
        // above the Drawer sidebar too, and this should only replace the
        // content area between the header and the sidebar, not cover both.
        // Shared by both Meditation and Exercise - whichever tab opened it.
        <ScrollView style={styles.fullScreenBody} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={[styles.fullScreenBodyInner, !isDesktop && styles.fullScreenBodyInnerMobile, { maxWidth: dashboardContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
            <MeditationPlayer exercise={openedTechnique} onBack={() => setOpenedTechnique(null)} />
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={[styles.body, !isDesktop && styles.bodyMobile, { maxWidth: dashboardContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
            {/* Hero Journal Card with Illustration */}
            <Pressable
              style={[styles.journalBanner, !isDesktop && styles.journalBannerMobile]}
              onPress={() => navigation?.navigate('MyEntry')}
            >
              <View style={styles.journalIconTile}>
                <Feather name="book-open" size={22} color={colors.primary} />
              </View>

              <View style={styles.journalTextContainer}>
                <Text style={styles.journalTitle}>My Journal</Text>
                <Text style={styles.journalSubtext}>Write down how you're feeling, in your own words</Text>
              </View>

              {/* Desktop keeps the inline illustration exactly as before. On
                  mobile it's dropped rather than floated elsewhere - with
                  the book icon already leading the row on the left, a
                  second book+pencil graphic elsewhere in the card just read
                  as a duplicate/misplaced icon, not a deliberate flourish. */}
              {isDesktop && (
                <View style={styles.illustrationWrap}>
                  <JournalIllustration width={130} height={85} />
                </View>
              )}

              <View style={styles.journalChevronBtn}>
                <Feather name="chevron-right" size={16} color={colors.white} />
              </View>
            </Pressable>

            {/* Underlined Segment Tabs - equal-width flex columns on mobile so
                all three (Exercise/Meditation/Music) always fit the screen
                width instead of overflowing past its right edge. */}
            <View style={[styles.tabsContainer, !isDesktop && styles.tabsContainerMobile]}>
              {SEGMENTS.map((tab) => {
                const isActive = segment === tab.value;
                return (
                  <Pressable
                    key={tab.value}
                    style={[styles.tabButton, !isDesktop && styles.tabButtonMobile, isActive && styles.tabButtonActive]}
                    onPress={() => setSegment(tab.value)}
                  >
                    <Feather
                      name={tab.icon}
                      size={16}
                      color={isActive ? colors.primary : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Tab Content */}
            {segment === 'meditation' ? (
              <MeditationList onSelect={setOpenedTechnique} />
            ) : (
              <ContentList category={segment} onOpenTechnique={setOpenedTechnique} />
            )}
          </View>
        </ScrollView>
      )}

      {!isDesktop && <BottomNavBar currentTab="Wellness" navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
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
  // Clearance for the floating BottomNavBar so the last card in the list
  // isn't covered by it.
  bodyMobile: { paddingBottom: 100 },
  fullScreenBody: { flex: 1, backgroundColor: colors.background },
  fullScreenBodyInner: { padding: spacing.xl, paddingTop: spacing.xxl, flexGrow: 1 },
  fullScreenBodyInnerMobile: { paddingBottom: 100 },

  /* Journal Card Header */
  journalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: spacing.xl,
    position: 'relative',
    overflow: 'hidden',
    ...shadow.card,
  },
  journalIconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  journalBannerMobile: {
    // Tighter padding + gap on mobile so the icon/text/illustration/chevron
    // row has more room to breathe on a narrow screen.
    padding: spacing.lg,
  },
  journalTextContainer: { flex: 1, zIndex: 2 },
  journalTitle: { ...typography.h3, color: colors.primaryDark, fontWeight: '700', fontSize: 18 },
  journalSubtext: { ...typography.caption, color: colors.textSecondary, marginTop: 4, fontSize: 13, maxWidth: '85%' },
  illustrationWrap: {
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  journalChevronBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  /* Underline Tab Navigation */
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xl,
  },
  // Equal-width flex columns instead of auto-sized-plus-margin tabs, so all
  // three tabs always fit exactly within the screen width on mobile - the
  // "Music" label getting cut off was this row overflowing past the right
  // edge on narrow phones.
  tabsContainerMobile: {
    justifyContent: 'space-between',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: spacing.lg,
  },
  tabButtonMobile: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 0,
    paddingHorizontal: spacing.xs,
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: { ...typography.bodyStrong, color: colors.textSecondary, fontSize: 14 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },

  /* Content Cards */
  contentListGap: { gap: spacing.lg },
  contentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardMainRow: { flexDirection: 'row', alignItems: 'center' },
  itemIconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight + '80',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  itemTextContainer: { flex: 1, paddingRight: spacing.md },
  itemTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  itemBody: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 18, fontSize: 12 },
  durationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  durationPillText: { ...typography.caption, color: colors.primary, fontWeight: '700', fontSize: 11 },
});