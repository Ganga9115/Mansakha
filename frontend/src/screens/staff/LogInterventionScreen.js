import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Button from '../../components/Button';
import { useToast } from '../../context/ToastContext';
import { useLogIntervention, useInterventionTypes } from '../../services/hooks';
import { QueryBoundary } from '../../components/QueryStates';

// How long the "Intervention logged" confirmation stays on screen before
// auto-navigating back to the case - long enough to register, short enough
// not to feel like an extra step.
const CONFIRMATION_DISPLAY_MS = 1200;

export default function LogInterventionScreen({ navigation, route }) {
  const { victimId, suggestedInterventionTypeId } = route.params;
  const [selectedId, setSelectedId] = useState(suggestedInterventionTypeId || null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const typesQuery = useInterventionTypes();
  const logIntervention = useLogIntervention(victimId);
  const toast = useToast();

  useEffect(() => {
    if (!submitted) return undefined;
    const timer = setTimeout(() => navigation.goBack(), CONFIRMATION_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [submitted, navigation]);

  const handleSubmit = async () => {
    setError(null);
    if (!selectedId) {
      setError('Select an intervention type.');
      return;
    }
    try {
      await logIntervention.mutateAsync({ interventionTypeId: selectedId, notes });
      toast.success('Intervention logged');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (submitted) {
    return (
      <View style={styles.confirmContainer}>
        <View style={styles.confirmIconTile}>
          <Feather name="check" size={30} color={colors.onPrimary} />
        </View>
        <Text style={styles.confirmTitle}>Intervention logged</Text>
        <Text style={styles.confirmSubtitle}>Returning to the case...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log Intervention</Text>

      {suggestedInterventionTypeId && (
        <View style={styles.suggestionRow}>
          <Feather name="zap" size={13} color={colors.primaryDark} />
          <Text style={styles.suggestionText}>AI-suggested type pre-selected below - review before saving.</Text>
        </View>
      )}

      <QueryBoundary query={typesQuery}>
        {(data) => (
          <View style={styles.chipRow}>
            {data.interventionTypes.map((t) => {
              const isSuggested = t.intervention_type_id === suggestedInterventionTypeId;
              return (
                <Pressable
                  key={t.intervention_type_id}
                  style={[styles.chip, selectedId === t.intervention_type_id && styles.chipActive]}
                  onPress={() => setSelectedId(t.intervention_type_id)}
                >
                  {isSuggested && <Feather name="zap" size={12} color={selectedId === t.intervention_type_id ? colors.onPrimary : colors.primary} style={styles.suggestionIcon} />}
                  <Text style={[styles.chipText, selectedId === t.intervention_type_id && styles.chipTextActive]}>{t.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </QueryBoundary>

      <TextInput
        style={styles.notes}
        placeholder="Notes (optional)"
        placeholderTextColor={colors.textSecondary}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Save" onPress={handleSubmit} loading={logIntervention.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  title: { ...typography.h2, color: colors.primaryDark, marginBottom: spacing.lg },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  suggestionText: { ...typography.caption, color: colors.primaryDark },
  suggestionIcon: { marginRight: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.bodySmall, color: colors.textSecondary },
  chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  notes: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    backgroundColor: colors.white, color: colors.textPrimary, minHeight: 100, textAlignVertical: 'top', marginBottom: spacing.lg,
    ...typography.body,
  },
  error: { color: colors.danger, marginBottom: spacing.md },
  confirmContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xxxl },
  confirmIconTile: {
    width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  confirmTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  confirmSubtitle: { ...typography.body, color: colors.textSecondary },
});
