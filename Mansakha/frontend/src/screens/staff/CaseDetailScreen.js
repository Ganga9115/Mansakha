import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import IconInput from '../../components/IconInput';
import StatusBadge from '../../components/StatusBadge';
import DataTable from '../../components/DataTable';
import AlertBanner from '../../components/AlertBanner';
import Section from '../../components/Section';
import ScreenContainer from '../../components/ScreenContainer';
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
    <Card headerTitle="Case notes">
      <QueryBoundary query={notesQuery} empty={(data) => !data?.notes?.length}>
        {(data) => (
          <View>
            {data.notes.map((n, i) => (
              <View key={n.noteId} style={[styles.noteRow, i === data.notes.length - 1 && styles.noteRowLast]}>
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

  const signalColumns = [
    { key: 'signal', label: 'Signal', flex: 1.5, render: (item) => <Text style={styles.signalName}>{item.signal.replace(/_/g, ' ')}</Text> },
    { key: 'value', label: 'Value', flex: 1, render: (item) => <Text style={styles.signalValue}>{item.value.toFixed(2)}</Text> },
  ];

  return (
    <ScreenContainer>
      <QueryBoundary query={query}>
        {(data) => {
          const trend = TREND_META[data.trend] || TREND_META.insufficient_data;
          return (
            <>
              <Section eyebrow="Summary" title="Risk assessment">
                <Card headerTitle="Current status">
                  <View style={styles.headerRow}>
                    <Text style={styles.title}>Score: {data.score}</Text>
                    <StatusBadge status={data.riskLevel} />
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
              </Section>

              <Section eyebrow="Explainability" title="Contributing signals">
                <DataTable columns={signalColumns} data={data.riskFactors} keyExtractor={(item) => item.signal} emptyMessage="No signals recorded for this check-in." emptyIcon="activity" />
                {data.explanation && (
                  <AlertBanner variant="info" title="AI explanation">
                    {data.explanation}
                  </AlertBanner>
                )}
                {data.suggestedInterventionType && (
                  <AlertBanner variant="info" title="AI-suggested intervention">
                    {`${data.suggestedInterventionType.name} - review before acting.`}
                  </AlertBanner>
                )}
              </Section>

              <Section eyebrow="History" title="Case notes">
                <NotesSection victimId={victimId} readOnly={readOnly} />
              </Section>

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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xs },
  trendText: { ...typography.bodyStrong },
  markCompleteButton: { marginTop: spacing.md },
  signalName: { ...typography.bodySmall, color: colors.textPrimary, textTransform: 'capitalize' },
  signalValue: { ...typography.bodySmall, color: colors.textSecondary },
  noteRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  noteRowLast: { borderBottomWidth: 0 },
  noteMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  noteAuthor: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  noteTime: { ...typography.caption, color: colors.textSecondary, marginLeft: 'auto' },
  noteText: { ...typography.bodySmall, color: colors.textPrimary },
  addNoteRow: { marginTop: spacing.md },
  button: { marginTop: spacing.xs },
});
