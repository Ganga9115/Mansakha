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
import { useUserDashboard, useSubmitLegalAidRequest, useUploadLegalAidDocument, useMyLegalAidRequestCurrent } from '../../shared/services/hooks';

// "Request Legal Aid" - reason/description + optional new document uploads,
// mirroring RequestInterventionScreen.js's pick-then-upload-after-submit
// pattern. Existing case documents (FIR, caste certificate, etc. already on
// file) are auto-linked SERVER-SIDE the moment the request is created - the
// victim never re-uploads anything already provided; the post-submit summary
// below shows exactly what got linked.

export default function LegalAidRequestScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const activeUserId = dashboardQuery.data?.userId;

  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [pendingDocs, setPendingDocs] = useState([]); // [{ label, uri, mimeType }]
  const [newLabel, setNewLabel] = useState('');
  const [submittedRequestId, setSubmittedRequestId] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const submitRequest = useSubmitLegalAidRequest(activeUserId);
  const uploadDocument = useUploadLegalAidDocument();
  const submittedQuery = useMyLegalAidRequestCurrent(activeUserId);

  const handleAddDocument = async () => {
    if (!newLabel.trim()) {
      Alert.alert('Label required', 'Give this document a short label first (e.g. "Medical Report").');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to attach a document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPendingDocs((prev) => [...prev, { label: newLabel.trim(), uri: asset.uri, mimeType: asset.mimeType }]);
    setNewLabel('');
  };

  const handleRemoveDocument = (index) => {
    setPendingDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setError(null);
    try {
      const result = await submitRequest.mutateAsync({ reason: reason.trim(), description: description.trim() || undefined });
      setUploading(true);
      for (const doc of pendingDocs) {
        await uploadDocument.mutateAsync({ requestId: result.requestId, documentLabel: doc.label, uri: doc.uri, mimeType: doc.mimeType });
      }
      setUploading(false);
      setSubmittedRequestId(result.requestId);
      submittedQuery.refetch();
    } catch (err) {
      setUploading(false);
      setError(err.message || 'Could not submit your request.');
    }
  };

  const submitted = !!submittedRequestId;
  const documents = submittedQuery.data?.documents || [];
  const existingDocs = documents.filter((d) => d.source === 'existing_case_document');
  const uploadedDocs = documents.filter((d) => d.source === 'uploaded');

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
            <Feather name="briefcase" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Request Legal Aid</Text>
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
          {!submitted ? (
            <Card>
              <Text style={styles.cardTitle}>Tell us why you need legal aid</Text>
              <Text style={styles.introText}>Your request goes straight to your district's DLSA (District Legal Services Authority) for review.</Text>

              <Text style={styles.fieldLabel}>Reason</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="e.g. I need a lawyer to represent me at the trial stage of my case..."
                placeholderTextColor={colors.textSecondary}
                value={reason}
                onChangeText={setReason}
              />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Any further detail about the assistance you need..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.fieldLabel}>Additional Supporting Documents (optional)</Text>
              <Text style={styles.helperText}>
                Documents you've already provided (FIR copy, caste certificate, etc.) are linked automatically - you don't need to re-upload them.
              </Text>
              {pendingDocs.map((doc, i) => (
                <View key={i} style={styles.pendingDocRow}>
                  <Feather name="paperclip" size={14} color={colors.primary} />
                  <Text style={styles.pendingDocLabel}>{doc.label}</Text>
                  <Pressable onPress={() => handleRemoveDocument(i)} hitSlop={6}>
                    <Feather name="x" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
              <View style={styles.addDocRow}>
                <TextInput
                  style={styles.labelInput}
                  placeholder="Document label"
                  placeholderTextColor={colors.textSecondary}
                  value={newLabel}
                  onChangeText={setNewLabel}
                />
                <Pressable style={styles.addDocBtn} onPress={handleAddDocument}>
                  <Feather name="camera" size={14} color={colors.primary} />
                  <Text style={styles.addDocBtnText}>Add Photo</Text>
                </Pressable>
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <Button
                title={uploading ? 'Uploading documents...' : 'Send Request'}
                onPress={handleSubmit}
                loading={submitRequest.isPending || uploading}
                disabled={!reason.trim() || submitRequest.isPending || uploading}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : (
            <Card>
              <View style={styles.submittedBanner}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={styles.submittedText}>Your Legal Aid request has been sent to your district DLSA.</Text>
              </View>

              {existingDocs.length > 0 && (
                <View style={styles.docSection}>
                  <Text style={styles.fieldLabel}>Linked from your existing case documents</Text>
                  {existingDocs.map((d) => (
                    <View key={d.documentId} style={styles.docListRow}>
                      <Feather name="file-text" size={14} color={colors.textSecondary} />
                      <Text style={styles.docListText}>{d.documentLabel}</Text>
                    </View>
                  ))}
                </View>
              )}
              {uploadedDocs.length > 0 && (
                <View style={styles.docSection}>
                  <Text style={styles.fieldLabel}>Newly uploaded</Text>
                  {uploadedDocs.map((d) => (
                    <View key={d.documentId} style={styles.docListRow}>
                      <Feather name="file-text" size={14} color={colors.textSecondary} />
                      <Text style={styles.docListText}>{d.documentLabel}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Button title="View My Legal Aid Request" onPress={() => navigation.navigate('LegalAidHub')} style={{ marginTop: spacing.md }} />
            </Card>
          )}
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

  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, marginBottom: spacing.xs },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, marginBottom: spacing.sm, marginTop: spacing.sm },
  helperText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 16 },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    minHeight: 80, textAlignVertical: 'top', color: colors.textPrimary, ...typography.bodySmall,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginTop: spacing.sm },

  pendingDocRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight + '30', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.xs,
  },
  pendingDocLabel: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },
  addDocRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  labelInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, ...typography.bodySmall, color: colors.textPrimary,
  },
  addDocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.primary,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.pill,
  },
  addDocBtnText: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  submittedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md },
  submittedText: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },
  docSection: { marginTop: spacing.md },
  docListRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 4 },
  docListText: { ...typography.bodySmall, color: colors.textPrimary },
});
