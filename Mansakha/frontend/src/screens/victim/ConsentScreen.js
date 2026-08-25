import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { useToast } from '../../context/ToastContext';
import { useSubmitConsent } from '../../services/hooks';
import Card from '../../components/Card';
import Button from '../../components/Button';

// Shown once after login, before Home - Screen Inventory (Section 8). Consent is
// per-channel (consent_records has a channel_id) - Mobile App is the channel this
// consent covers, since that's what's being consented to here.
export default function ConsentScreen({ onConsented }) {
  const submitConsent = useSubmitConsent();
  const toast = useToast();

  const handleConsent = async () => {
    try {
      await submitConsent.mutateAsync('Mobile App');
      toast.success('Thanks - your consent has been recorded.');
      onConsented();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconTile}>
        <Feather name="shield" size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>Before we begin</Text>
      <Card elevated>
        <Text style={styles.body}>
          Mansakha will check in with you regularly to understand how you're doing.
          Your responses are used only to support you and your case - a counsellor or
          designated official may be alerted if you seem to need help. You can revoke
          this consent later from Settings.
        </Text>
      </Card>

      <Button
        title="I agree, continue"
        icon="arrow-right"
        onPress={handleConsent}
        loading={submitConsent.isPending}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.background },
  iconTile: {
    width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg,
  },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.lg, textAlign: 'center' },
  body: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  button: { marginTop: spacing.xl },
});
