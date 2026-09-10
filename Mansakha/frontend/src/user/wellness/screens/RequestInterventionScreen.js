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

const STATUS_META = {
  Pending: { color: colors.warning, bg: colors.warningLight, icon: 'clock' },
  Accepted: { color: colors.success, bg: colors.successLight, icon: 'check-circle' },
  Rejected: { color: colors.danger, bg: colors.dangerLight, icon: 'x-circle' },
};

function getTypeIcon(name) {
  switch (name) {
    case 'Financial Assistance':
      return 'credit-card';
    case 'Legal Aid':
      return 'briefcase';
    case 'Medical':
      return 'plus-square';
    case 'Relocation':
      return 'home';
    case 'Witness Protection':
      return 'shield';
    default:
      return 'user';
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

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

function NewRequestForm({ types, caseUserId, navigation }) {
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [description, setDescription] = useState('');
  const [pendingDocs, setPendingDocs] = useState({});
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [uploadingLabel, setUploadingLabel] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const submitRequest = useSubmitInterventionRequest(caseUserId);
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

  const missingRequired = (selectedType?.requiredDocuments || [])
    .filter((d) => d.required && !pendingDocs[d.label])
    .map((d) => d.label);

  const handleSubmit = async () => {
    if (!selectedTypeId) return;
    if (missingRequired.length > 0) {
      setSubmitError(`Kindly attach: ${missingRequired.join(', ')}`);
      return;
    }
    setSubmitError(null);
    try {
      const result = await submitRequest.mutateAsync({ interventionTypeId: selectedTypeId, description });
      for (const [label, file] of Object.entries(pendingDocs)) {
        setUploadingLabel(label);
        await uploadDocument.mutateAsync({
          requestId: result.requestId,
          documentLabel: label,
          uri: file.uri,
          mimeType: file.mimeType,
        });
      }
      setUploadingLabel(null);
      setActiveRequestId(result.requestId);
    } catch (err) {
      setUploadingLabel(null);
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
    setPendingDocs((prev) => ({ ...prev, [label]: { uri: asset.uri, mimeType: asset.mimeType } }));
    setSubmitError(null);
  };

  return (
    <Card style={styles.cardContainer}>
      <View style={styles.cardHeaderRow}>
        <Feather name="file-text" size={18} color={colors.primaryDark} />
        <Text style={styles.cardHeaderTitle}>New Request</Text>
      </View>

      {!submitted ? (
        <>
          <View style={styles.typeGrid}>
            {/* Legal Aid (migration_040) - moved back under Request Assistance
                as one of the assistance types, since it IS one, rather than
                its own separate Home Screen entry point. Not part of the
                server-driven `types` list below (that intervention type is
                deliberately retired - Legal Aid has its own dedicated
                7-stage pipeline now), so it's a static tile that routes
                straight into that pipeline instead of the generic
                select-type-then-submit flow every other tile here follows.
                Submitting from there still reaches DLSA -> Public Prosecutor
                assignment exactly as before - only the entry point moved. */}
            <Pressable
              style={styles.typeCard}
              onPress={() => navigation?.navigate('LegalAidHub')}
            >
              <View style={styles.typeIconBox}>
                <Feather name="briefcase" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.typeCardText}>Legal Aid</Text>
            </Pressable>

            {types.map((t) => {
              const isSelected = selectedTypeId === t.interventionTypeId;
              return (
                <Pressable
                  key={t.interventionTypeId}
                  style={[styles.typeCard, isSelected && styles.typeCardActive]}
                  onPress={() => setSelectedTypeId(t.interventionTypeId)}
                >
                  <View style={[styles.typeIconBox, isSelected && styles.typeIconBoxActive]}>
                    <Feather
                      name={getTypeIcon(t.name)}
                      size={20}
                      color={isSelected ? colors.primaryDark : colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.typeCardText, isSelected && styles.typeCardTextActive]}>
                    {t.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedType && (
            <View style={styles.formSection}>
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

              {selectedType.requiredDocuments?.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Documents</Text>
                  {selectedType.requiredDocuments.map((doc) => (
                    <DocumentSlot
                      key={doc.label}
                      doc={doc}
                      attached={!!pendingDocs[doc.label]}
                      uploading={uploadingLabel === doc.label}
                      onPick={() => handlePickDocument(doc.label)}
                    />
                  ))}
                </>
              )}

              {submitError && <Text style={styles.errorText}>{submitError}</Text>}

              <Button
                title="Submit Request"
                onPress={handleSubmit}
                loading={submitRequest.isPending}
                disabled={missingRequired.length > 0 || submitRequest.isPending}
                style={{ marginTop: spacing.md }}
              />
            </View>
          )}
        </>
      ) : (
        <View style={{ paddingTop: spacing.sm }}>
          <View style={styles.submittedBanner}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={styles.submittedText}>
              Request submitted with your documents. You can track it below.
            </Text>
          </View>

          <Button title="Submit Another Request" variant="outline" onPress={resetForm} style={{ marginTop: spacing.md }} />
        </View>
      )}
    </Card>
  );
}

const STATUS_SCREEN_BY_TYPE = {
  // migration_040: 'Legal Aid' is retired from this intake (no new request of
  // this type can be submitted here any more), but a pre-existing accepted
  // one still needs somewhere to go - the new Legal Aid hub shows a
  // read-only "legacy request" banner for exactly this case.
  'Legal Aid': 'LegalAidHub',
  'Financial Assistance': 'FinancialAid',
  Medical: 'FinancialAid',
  'Witness Protection': 'ThreatReport',
  Relocation: 'ThreatReport',
};

function RequestHistoryItem({ r, navigation }) {
  const meta = STATUS_META[r.status] || STATUS_META.Pending;
  const statusScreen = r.status === 'Accepted' ? STATUS_SCREEN_BY_TYPE[r.interventionTypeName] : null;

  return (
    <Pressable 
      style={styles.historyRow}
      onPress={() => statusScreen && navigation?.navigate(statusScreen)}
      disabled={!statusScreen}
    >
      <View style={styles.historyLeft}>
        <View style={styles.historyIconBox}>
          <Feather name={getTypeIcon(r.interventionTypeName)} size={18} color={colors.primaryDark} />
        </View>
        <View style={styles.historyMainContent}>
          <Text style={styles.historyTypeName}>
            {r.interventionTypeName}
            {!!r.docketNumber && <Text style={styles.historyDocket}>  ·  Docket {r.docketNumber}</Text>}
          </Text>
          <Text style={styles.historyDateText}>Requested {formatDate(r.requestedAt)}</Text>
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
        </View>
      </View>

      <View style={styles.historyRight}>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={11} color={meta.color} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{r.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function RequestInterventionScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard(route?.params?.caseUserId);
  const activeUserId = dashboardQuery.data?.userId;
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
          {/* Banner / Hero Section */}
          <View style={styles.heroBanner}>
            <View style={styles.heroIconBox}>
              <Feather name="shield" size={22} color={colors.primaryDark} />
            </View>
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>Request Assistance</Text>
              <Text style={styles.heroSubtitle}>Choose the type of support you need.</Text>
            </View>
          </View>

          {/* New Request Form Card */}
          <QueryBoundary query={typesQuery}>
            {(typesData) => <NewRequestForm types={typesData?.interventionTypes || []} caseUserId={activeUserId} navigation={navigation} />}
          </QueryBoundary>

          {/* My Requests Section Card */}
          <Card style={styles.cardContainer}>
            <View style={styles.cardHeaderRow}>
              <Feather name="file-text" size={18} color={colors.primaryDark} />
              <Text style={styles.cardHeaderTitle}>My Requests</Text>
            </View>

            <QueryBoundary query={requestsQuery}>
              {() =>
                requests.length === 0 ? (
                  <EmptyState icon="inbox" message="You haven't requested any assistance yet." />
                ) : (
                  <View style={styles.historyList}>
                    {requests.map((r, i) => (
                      <View key={r.requestId}>
                        {i > 0 && <View style={styles.historyDivider} />}
                        <RequestHistoryItem r={r} navigation={navigation} />
                      </View>
                    ))}
                  </View>
                )
              }
            </QueryBoundary>
          </Card>

          {/* Info Banner at Bottom */}
          <View style={styles.infoBanner}>
            <View style={styles.infoBannerIcon}>
              <Feather name="info" size={18} color={colors.primaryDark} />
            </View>
            <Text style={styles.infoBannerText}>
              Requests are reviewed by the office best placed to verify your proof - the District Welfare Officer
              for Financial Assistance and Medical, DLSA for Legal Aid, your Protection Officer for Witness
              Protection and Relocation, and District Administration for Rehabilitation.
            </Text>
          </View>
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
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 960, alignSelf: 'center' },

  // Hero Section
  heroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  heroTextContainer: { flex: 1 },
  heroTitle: { ...typography.h2, color: colors.primaryDark, fontWeight: '700', fontSize: 20 },
  heroSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },

  // Card Styling
  cardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardHeaderTitle: { ...typography.h3, color: colors.primaryDark, fontWeight: '700', fontSize: 16 },

  // Grid for New Request Types
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  typeCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '30',
  },
  typeIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  typeIconBoxActive: {
    backgroundColor: colors.primaryLight,
  },
  typeCardText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  typeCardTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },

  formSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '60',
  },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, marginBottom: spacing.sm, marginTop: spacing.xs },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginTop: spacing.sm },

  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  submittedText: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },

  docSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border + '50',
  },
  docLabel: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13 },
  docTag: { ...typography.caption, fontSize: 10, marginTop: 2 },
  docTagRequired: { color: colors.danger },
  docTagOptional: { color: colors.textSecondary },
  docAttachedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successLight,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  docAttachedText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  docPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  docPickText: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  // History List
  historyList: {
    marginTop: spacing.xs,
  },
  historyDivider: {
    height: 1,
    backgroundColor: colors.border + '50',
    marginVertical: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: spacing.sm,
  },
  historyIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  historyMainContent: { flex: 1 },
  historyTypeName: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14 },
  historyDocket: { ...typography.caption, color: colors.textSecondary, fontWeight: '400' },
  historyDateText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  historyDescription: { ...typography.bodySmall, color: colors.textPrimary, marginTop: spacing.xs },
  historyDocs: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  rejectionBox: { backgroundColor: colors.dangerLight, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  rejectionLabel: { ...typography.label, color: colors.danger, fontSize: 10 },
  rejectionText: { ...typography.bodySmall, color: colors.textPrimary, marginTop: 2 },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  statusPillText: { ...typography.caption, fontWeight: '700', fontSize: 11 },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primaryLight + '40',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  infoBannerIcon: {
    marginRight: spacing.xs,
    marginTop: 2,
  },
  infoBannerText: {
    ...typography.caption,
    color: colors.primaryDark,
    flex: 1,
    lineHeight: 18,
  },
});