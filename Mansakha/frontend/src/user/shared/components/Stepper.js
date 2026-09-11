import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Vertical progress rail for the signup panel - static states (no
// animated fill), each step showing a short line of context copy (why
// this step exists), not just a number. steps: [{ title, context }]
export default function Stepper({ step, steps }) {
  return (
    <View style={styles.rail}>
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'active' : 'pending';
        return (
          <View key={s.title} style={styles.row}>
            <View style={styles.markerCol}>
              <Marker state={state} />
              {i < steps.length - 1 && <View style={[styles.connector, state !== 'pending' && styles.connectorDone]} />}
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.stepTitle, state === 'pending' && styles.stepTitleMuted]}>{s.title}</Text>
              {state === 'active' && <Text style={styles.stepContext}>{s.context}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Marker({ state }) {
  return (
    <View style={[styles.marker, state !== 'pending' && styles.markerActive]}>
      {state === 'done' ? <Feather name="check" size={12} color={colors.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: spacing.xl },
  row: { flexDirection: 'row' },
  markerCol: { alignItems: 'center', marginRight: spacing.md },
  marker: {
    width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  markerActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  connector: { width: 2, flex: 1, minHeight: 28, backgroundColor: colors.border, marginVertical: 4 },
  connectorDone: { backgroundColor: colors.primary },
  textCol: { flex: 1, paddingBottom: spacing.lg },
  stepTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  stepTitleMuted: { color: colors.textSecondary },
  stepContext: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 },
});
