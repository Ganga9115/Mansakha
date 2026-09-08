import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Button from '../../shared/components/Button';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary, EmptyState } from '../../shared/components/QueryStates';
import {
  useUserDashboard,
  useInterventionTypes,
  useMyInterventionRequests,
  useSubmitInterventionRequest,
  useUploadInterventionDocument,
} from '../../shared/services/hooks';

// Modeled on how a real Indian state residential/domicile certificate
// application actually works (e-District/CSC style): pick what you're
// asking for, attach the proof it genuinely requires, submit, then track
// a status your District Admin decides on - Accepted/Rejected with a
// reason - see migration_027_intervention_requests.sql and its own design
// doc for the document-requirement research behind each type below.

const STATUS_META = {
  Pending: { color: colors.warning, bg: colors.warningLight, icon: 'clock' },
  Accepted: { color: colors.success, bg: colors.successLight, icon: 'check-circle' },
  Rejected: { color: colors.danger, bg: colors.dangerLight, icon: 'x-circle' },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// One row per required/optional document for the selected type - shows
// whether it's attached yet and lets the victim pick a photo of it.
function DocumentSlot({ doc, attached, uploading, onPick }) {
  return (
    <View style={styles.docSlot}>
      <View style={{ flex: 1 }}>
        <Text style={styles.docLabel}>{doc.label}</Text>
        <Text style={[styles.docTag, doc.required ? styles.docTagRequired : styles.docTagOptional]}>
          {doc.required ? 'Required' : 'Optional'}
        </Text>
      </View>
      {attached ? (
        <View style={styles.docAttachedPill}>
          <Feather name="check" size={14} color={colors.success} />
          <Text style={styles.docAttachedText}>Attached</Text>
        </View>
      ) : (
        <Pressable style={styles.docPickBtn} onPress={onPick} disabled={uploading}>
          <Feather name="camera" size={14} color={colors.primary} />
          <Text style={styles.docPickText}>{uploading ? 'Uploading...' : 'Add Photo'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function NewRequestForm({ types }) {
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [description, setDescription] = useState('');
  const [pendingDocs, setPendingDocs] = useState({}); // label -> {uri, mimeType}
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [uploadingLabel, setUploadingLabel] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const submitRequest = useSubmitInterventionRequest();
  const uploadDocument = useUploadInterventionDocument();

  const selectedType = types.find((t) => t.interventionTypeId === selectedTypeId);
  const submitted = !!activeRequestId;

  const resetForm = () => {
    setSelectedTypeId(null);
    setDescription('');
    setPendingDocs({});
    setActiveRequestId(null);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!selectedTypeId) return;
    setSubmitError(null);
    try {
      const result = await submitRequest.mutateAsync({ interventionTypeId: selectedTypeId, description });
      setActiveRequestId(result.requestId);
    } catch (err) {
      setSubmitError(err.message || 'Could not submit your request.');
    }
  };

  const handlePickDocument = async (label) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to attach proof documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingLabel(label);
    try {
      await uploadDocument.mutateAsync({ requestId: activeRequestId, documentLabel: label, uri: asset.uri, mimeType: asset.mimeType });
      setPendingDocs((prev) => ({ ...prev, [label]: { uri: asset.uri } }));
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not upload this document.');
    } finally {
      setUploadingLabel(null);
    }
  };

  return (
    <Card headerTitle="New Request">
      {!submitted ? (
        <>
          <Text style={styles.fieldLabel}>What kind of assistance do you need?</Text>
          <View style={styles.typeGrid}>
            {types.map((t) => (
              <Pressable
                key={t.interventionTypeId}
                style={[styles.typeChip, selectedTypeId === t.interventionTypeId && styles.typeChipActive]}
                onPress={() => setSelectedTypeId(t.interventionTypeId)}
              >
                <Text style={[styles.typeChipText, selectedTypeId === t.interventionTypeId && styles.typeChipTextActive]}>
                  {t.name}
                </Text>
              </Pressable>
            ))}
          </View>

          {selectedType && (
            <>
              <Text style={styles.docsPreviewNote}>
                This will require: {selectedType.requiredDocuments.map((d) => d.label).join(', ') || 'no documents'}
              </Text>

              <Text style={styles.fieldLabel}>Tell us more (optional)</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={4}
                placeholder="Briefly describe your situation and why you need this..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
              />

              {submitError && <Text style={styles.errorText}>{submitError}</Text>}

              <Button
                title="Submit Request"
                onPress={handleSubmit}
                loading={submitRequest.isPending}
                style={{ marginTop: spacing.md }}
              />
            </>
          )}
        </>
      ) : (
        <>
          <View style={styles.submittedBanner}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={styles.submittedText}>Request submitted. Now attach your proof documents below.</Text>
          </View>

          {selectedType.requiredDocuments.map((doc) => (
            <DocumentSlot
              key={doc.label}
              doc={doc}
              attached={!!pendingDocs[doc.label]}
              uploading={uploadingLabel === doc.label}
              onPick={() => handlePickDocument(doc.label)}
            />
          ))}

          <Button title="Done - Submit Another" variant="outline" onPress={resetForm} style={{ marginTop: spacing.lg }} />
        </>
      )}
    </Card>
  );
}

// Once a proof-verified request is Accepted, the specialist role's own
// screen (already built for its own referral-tracking purpose) becomes the
// real place to follow progress - assigned lawyer for Legal Aid, relief
// status for Financial Assistance/Medical, protection updates for Witness
// Protection/Relocation. Both routes read the exact same underlying
// agency_referral this Accept just created, so no new screen is needed.
const STATUS_SCREEN_BY_TYPE = {
  'Legal Aid': 'LegalAid',
  'Financial Assistance': 'FinancialAid',
  Medical: 'FinancialAid',
  'Witness Protection': 'ThreatReport',
  Relocation: 'ThreatReport',
};

function RequestHistoryItem({ r, navigation }) {
  const meta = STATUS_META[r.status] || STATUS_META.Pending;
  const statusScreen = r.status === 'Accepted' ? STATUS_SCREEN_BY_TYPE[r.interventionTypeName] : null;

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyTopRow}>
        <Text style={styles.historyType}>{r.interventionTypeName}</Text>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={11} color={meta.color} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{r.status}</Text>
        </View>
      </View>
      <Text style={styles.historyDate}>Requested {formatDate(r.requestedAt)}</Text>
      {r.description ? <Text style={styles.historyDescription}>{r.description}</Text> : null}
      {r.documents?.length > 0 && (
        <Text style={styles.historyDocs}>
          {r.documents.length} document{r.documents.length > 1 ? 's' : ''} attached
        </Text>
      )}
      {r.status === 'Rejected' && r.decisionReason && (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionLabel}>Reason</Text>
          <Text style={styles.rejectionText}>{r.decisionReason}</Text>
        </View>
      )}
      {statusScreen && (
        <Pressable style={styles.viewStatusBtn} onPress={() => navigation?.navigate(statusScreen)}>
          <Text style={styles.viewStatusBtnText}>View Status</Text>
          <Feather name="arrow-right" size={13} color={colors.primaryDark} />
        </Pressable>
      )}
    </View>
  );
}

export default function RequestInterventionScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const typesQuery = useInterventionTypes();
  const requestsQuery = useMyInterventionRequests();
  const requests = requestsQuery.data?.requests || [];

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          {!isDesktop && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          <View style={styles.headerIconTile}>
            <Feather name="life-buoy" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Request Assistance</Text>
        </View>
        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions fullName={dashboardQuery.data?.fullName} alertCount={dashboardQuery.data?.alerts?.length || 0} onBellPress={() => {}} />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <QueryBoundary query={typesQuery}>
            {(typesData) => <NewRequestForm types={typesData?.interventionTypes || []} />}
          </QueryBoundary>

          <Text style={styles.sectionTitle}>My Requests</Text>
          <QueryBoundary query={requestsQuery}>
            {() =>
              requests.length === 0 ? (
                <EmptyState icon="inbox" message="You haven't requested any assistance yet." />
              ) : (
                <Card>
                  {requests.map((r, i) => (
                    <View key={r.requestId} style={i > 0 ? styles.historyDivider : null}>
                      <RequestHistoryItem r={r} navigation={navigation} />
                    </View>
                  ))}
                </Card>
              )
            }
          </QueryBoundary>

          <Text style={styles.disclaimer}>
            Requests are reviewed by the office best placed to verify your proof - the District Welfare Officer
            for Financial Assistance and Medical, DLSA for Legal Aid, your Protection Officer for Witness
            Protection and Relocation, and District Administration for Rehabilitation.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, backgroundColor: colors.background },
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
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  headerTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 20, fontWeight: '700' },
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 720, alignSelf: 'center' },

  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, marginBottom: spacing.sm, marginTop: spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  typeChipText: { ...typography.bodyStrong, color: colors.textSecondary, fontSize: 13 },
  typeChipTextActive: { color: colors.white },
  docsPreviewNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, fontStyle: 'italic' },

  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    ...typography.body, color: colors.textPrimary, textAlignVertical: 'top', minHeight: 90,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginTop: spacing.sm },

  submittedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  submittedText: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },

  docSlot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border + '50',
  },
  docLabel: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13 },
  docTag: { ...typography.caption, fontSize: 10, marginTop: 2 },
  docTagRequired: { color: colors.danger },
  docTagOptional: { color: colors.textSecondary },
  docAttachedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successLight, paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.pill,
  },
  docAttachedText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  docPickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.primary, paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.pill,
  },
  docPickText: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md, fontWeight: '700' },
  historyDivider: { borderTopWidth: 1, borderTopColor: colors.border + '50', marginTop: spacing.md, paddingTop: spacing.md },
  historyItem: {},
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyType: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  statusPillText: { ...typography.caption, fontWeight: '700', fontSize: 10 },
  historyDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  historyDescription: { ...typography.bodySmall, color: colors.textPrimary, marginTop: spacing.xs },
  historyDocs: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  rejectionBox: { backgroundColor: colors.dangerLight, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  rejectionLabel: { ...typography.label, color: colors.danger, fontSize: 10 },
  rejectionText: { ...typography.bodySmall, color: colors.textPrimary, marginTop: 2 },
  viewStatusBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, alignSelf: 'flex-start' },
  viewStatusBtnText: { ...typography.bodySmall, color: colors.primaryDark, fontWeight: '700' },

  disclaimer: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.lg, marginBottom: spacing.xxxl },
});
