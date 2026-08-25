import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Button from '../../components/Button';

// Deliberately calm and reassuring - never shows a raw risk-level/score label
// directly to the victim right after check-in. Showing something like "risk:
// Critical" in this moment would be a trauma-informed misstep even though the doc
// doesn't explicitly forbid it; distress trend is available separately in My
// Distress History for whoever chooses to look at it.
export default function CheckinConfirmationScreen({ navigation, route }) {
  const alertTriggered = route.params?.alertTriggered;

  return (
    <View style={styles.container}>
      <View style={styles.iconTile}>
        <Feather name="check" size={32} color={colors.success} />
      </View>
      <Text style={styles.title}>Thank you for checking in.</Text>
      <Text style={styles.body}>
        {alertTriggered
          ? "We've let your counsellor know you might need extra support. Someone should reach out soon."
          : 'Your response has been recorded.'}
      </Text>

      <Button title="Back to Home" icon="home" onPress={() => navigation.navigate('home')} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl, backgroundColor: colors.background },
  iconTile: {
    width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl, lineHeight: 22 },
  button: { minWidth: 200 },
});
