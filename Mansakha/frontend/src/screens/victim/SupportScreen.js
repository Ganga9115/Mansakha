import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { useToast } from '../../context/ToastContext';
import Card from '../../components/Card';
import Section from '../../components/Section';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useVictimDashboard } from '../../services/hooks';

// support links only carry a free-text `detail` string (no separate phone/email
// field from the backend) - pulling a number/address out of that text is what
// makes a real tel:/mailto: link possible without inventing data that isn't there.
const PHONE_PATTERN = /\b\d[\d\s-]{3,}\d\b/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function getLinkInfo(detail) {
  const emailMatch = detail.match(EMAIL_PATTERN);
  if (emailMatch) return { type: 'email', target: emailMatch[0], url: `mailto:${emailMatch[0]}` };
  const phoneMatch = detail.match(PHONE_PATTERN);
  if (phoneMatch) return { type: 'phone', target: phoneMatch[0].replace(/\s|-/g, ''), url: `tel:${phoneMatch[0].replace(/\s|-/g, '')}` };
  return null;
}

// Reuses the dashboard's supportLinks rather than a second, separately-maintained
// static list - one source of truth on the backend.
export default function SupportScreen() {
  const query = useVictimDashboard();
  const toast = useToast();

  const openLink = async (url) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      toast.error('Could not open that link on this device.');
    }
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>Support</Text>
      <QueryBoundary query={query}>
        {(data) => (
          <Section eyebrow="Resources" title="Ways to reach out">
            {data.supportLinks.map((link) => {
              const linkInfo = getLinkInfo(link.detail);
              const icon = linkInfo?.type === 'phone' ? 'phone' : linkInfo?.type === 'email' ? 'mail' : 'life-buoy';

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
                <Card key={link.label} elevated padding={spacing.md}>
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
          </Section>
        )}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.display, color: colors.textPrimary, marginBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  textWrap: { flex: 1 },
  label: { ...typography.bodyStrong, color: colors.textPrimary },
  detail: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
});
