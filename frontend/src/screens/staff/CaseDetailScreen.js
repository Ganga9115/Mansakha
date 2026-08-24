import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import IconInput from '../../components/IconInput';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useToast } from '../../context/ToastContext';
import { useCaseDetail, useCompleteIntervention, useCaseNotes, useAddCaseNote } from '../../services/hooks';

const TREND_META = {
  escalating: { icon: 'trending-up', color: colors.danger, label: 'Escalating' },
  stable_or_improving: { icon: 'trending-down', color: colors.low, label: 'Stable or improving' },
  insufficient_data: { icon: 'minus', color: colors.textSecondary, label: 'Insufficient data' },
};

function NotesSection({ victimId, readOnly }) {
  const notesQuery = useCaseNotes(victimId);
  const addNote = useAddCaseNote(victimId);
  const toast = useToast();
  const [noteText, setNoteText] = useState('');

  const submitNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync(noteText.trim());
      setNoteText('');
      toast.success('Note added');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card elevated>
      <Text style={styles.sectionTitle}>Case notes</Text>
      <QueryBoundary query={notesQuery} empty={(data) => !data?.notes?.length}>
        {(data) => (
          <View>
            {data.notes.map((n) => (
              <View key={n.noteId} style={styles.noteRow}>
                <View style={styles.noteMetaRow}>
                  <Feather name="user" size={12} color={colors.textSecondary} />
                  <Text style={styles.noteAuthor}>{n.authorName}</Text>
                  <Text style={styles.noteTime}>{new Date(n.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.noteText}>{n.noteText}</Text>
              </View>
            ))}
          </View>
        )}
      </QueryBoundary>

      {!readOnly && (
        <View style={styles.addNoteRow}>
          <IconInput icon="edit-3" placeholder="Add a note..." value={noteText} onChangeText={setNoteText} multiline numberOfLines={2} />
          <Button title="Add note" variant="secondary" onPress={submitNote} loading={addNote.isPending} />
        </View>
      )}
    </Card>
  );
}

// Shared by Counsellor (full access) and Administration (read-only) - same backend
// route (routes/counsellor.js's GET /cases/:victimId, role-broadened for both).
// `readOnly` (route param) controls whether the Log Intervention/Mark Complete/
// Add Note actions show - Administration accounts never get those, per Section 4.4.
export default function CaseDetailScreen({ navigation, route }) {
  const { victimId, readOnly } = route.params;
  const query = useCaseDetail(victimId);
  const completeIntervention = useCompleteIntervention(victimId);
  const toast = useToast();

  const handleComplete = async (interventionId) => {
    try {
      await completeIntervention.mutateAsync(interventionId);
      toast.success('Intervention marked complete');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <QueryBoundary query={query}>
        {(data) => {
          const trend = TREND_META[data.trend] || TREND_META.insufficient_data;
          return (
            <>
              <Card elevated>
                <View style={styles.headerRow}>
                  <Text style={styles.title}>Score: {data.score}</Text>
                  <RiskBadge riskLevel={data.riskLevel} />
                </View>
                <Text style={styles.meta}>Previous score: {data.previousScore ?? 'N/A'}</Text>
                <View style={styles.trendRow}>
                  <Feather name={trend.icon} size={15} color={trend.color} />
                  <Text style={[styles.trendText, { color: trend.color }]}>{trend.label}</Text>
                </View>
                <Text style={styles.meta}>Intervention status: {data.interventionStatus}</Text>
                {!readOnly && data.interventionStatus === 'pending' && data.interventionId && (
                  <Button
                    title="Mark intervention complete"
                    variant="outline"
                    icon="check"
                    onPress={() => handleComplete(data.interventionId)}
                    loading={completeIntervention.isPending}
                    style={styles.markCompleteButton}
                  />
                )}
              </Card>

              <Card elevated>
                <Text style={styles.sectionTitle}>Why this score - contributing signals</Text>
                {data.riskFactors.map((f) => (
                  <View key={f.signal} style={styles.signalRow}>
                    <Text style={styles.signalName}>{f.signal.replace(/_/g, ' ')}</Text>
                    <Text style={styles.signalValue}>{f.value.toFixed(2)}</Text>
                  </View>
                ))}
                {data.explanation && (
                  <View style={styles.explanationBox}>
                    <Feather name="message-circle" size={14} color={colors.primaryDark} />
                    <Text style={styles.explanationText}>{data.explanation}</Text>
                  </View>
                )}
                {data.suggestedInterventionType && (
                  <View style={styles.explanationBox}>
                    <Feather name="zap" size={14} color={colors.primaryDark} />
                    <Text style={styles.explanationText}>AI-suggested intervention: {data.suggestedInterventionType.name} (review before acting)</Text>
                  </View>
                )}
              </Card>

              <NotesSection victimId={victimId} readOnly={readOnly} />

              {!readOnly && (
                <Button
                  title="Log Intervention"
                  icon="clipboard"
                  onPress={() => navigation.navigate('LogIntervention', {
                    victimId, suggestedInterventionTypeId: data.suggestedInterventionType?.id || null,
                  })}
                  style={styles.button}
                />
              )}
            </>
          );
        }}
      </QueryBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xs },
  trendText: { ...typography.bodyStrong },
  markCompleteButton: { marginTop: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.primaryDark, marginBottom: spacing.sm },
  signalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  signalName: { ...typography.bodySmall, color: colors.textPrimary, textTransform: 'capitalize' },
  signalValue: { ...typography.bodySmall, color: colors.textSecondary },
  explanationBox: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.infoLight, borderRadius: 8,
  },
  explanationText: { flex: 1, ...typography.bodySmall, color: colors.primaryDark, fontStyle: 'italic' },
  noteRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  noteMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  noteAuthor: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  noteTime: { ...typography.caption, color: colors.textSecondary, marginLeft: 'auto' },
  noteText: { ...typography.bodySmall, color: colors.textPrimary },
  addNoteRow: { marginTop: spacing.md },
  button: { marginTop: spacing.xs },
});
