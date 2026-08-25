import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Button from '../../components/Button';
import AlertBanner from '../../components/AlertBanner';
import ScreenContainer from '../../components/ScreenContainer';
import { useToast } from '../../context/ToastContext';
import { useLogIntervention, useInterventionTypes } from '../../services/hooks';
import { QueryBoundary } from '../../components/QueryStates';

// How long the confirmation stays on screen before auto-navigating back -
// long enough to register, short enough not to feel like an extra step.
// No animated icon - a static AlertBanner, per the institutional-portal
// "avoid non-functional animation" requirement.
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
      <ScreenContainer>
        <AlertBanner variant="info" title="Intervention logged">
          Returning to the case...
        </AlertBanner>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Log Intervention</Text>

      {suggestedInterventionTypeId && (
        <AlertBanner variant="info" title="AI-suggested type pre-selected">
          Review the selection below before saving.
        </AlertBanner>
      )}

      <QueryBoundary query={typesQuery}>
        {(data) => (
          <View style={styles.optionList}>
            {data.interventionTypes.map((t) => {
              const isSuggested = t.intervention_type_id === suggestedInterventionTypeId;
              const active = selectedId === t.intervention_type_id;
              return (
                <Pressable
                  key={t.intervention_type_id}
                  style={styles.option}
                  onPress={() => setSelectedId(t.intervention_type_id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.optionText}>{t.name}</Text>
                  {isSuggested && <Feather name="zap" size={13} color={colors.primary} />}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.lg },
  optionList: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.lg, overflow: 'hidden' },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white,
  },
  radio: {
    width: 18, height: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.primary },
  optionText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  notes: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    backgroundColor: colors.white, color: colors.textPrimary, minHeight: 100, textAlignVertical: 'top', marginBottom: spacing.lg,
    ...typography.body,
  },
  error: { color: colors.danger, marginBottom: spacing.md },
});
