import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import IconInput from '../../components/IconInput';
import Dropdown from '../../components/Dropdown';
import { QueryBoundary } from '../../components/QueryStates';
import { useToast } from '../../context/ToastContext';
import { useStaffList, useCreateStaff, useRevokeStaff, useUpdateStaff, useDistrictOptions } from '../../services/hooks';

const ROLE_OPTIONS = ['Administration', 'Counsellor'];

function EditStaffRow({ item, onDone }) {
  const toast = useToast();
  const updateStaff = useUpdateStaff();
  const [fullName, setFullName] = useState(item.fullName);
  const [phone, setPhone] = useState(item.phone || '');

  const save = async () => {
    try {
      await updateStaff.mutateAsync({ officialId: item.officialId, fullName, phone });
      toast.success('Account updated.');
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <View style={styles.editForm}>
      <IconInput icon="user" placeholder="Full name" value={fullName} onChangeText={setFullName} />
      <IconInput icon="phone" placeholder="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <View style={styles.editButtonRow}>
        <Button title="Cancel" variant="outline" onPress={onDone} style={styles.halfWidth} />
        <Button title="Save" onPress={save} loading={updateStaff.isPending} style={styles.halfWidth} />
      </View>
    </View>
  );
}

// "Delete" is deliberately not a hard delete - officials has live FK
// references (interventions, audit_log, official_roles.assigned_by) that
// removing the row would break. Revoking every active role already fully
// locks the account out (verifyToken re-checks roles on every request), so
// this button IS the delete/deactivate action, just correctly labeled.
export default function StaffManagementScreen() {
  const toast = useToast();
  const [page] = useState(1);
  const listQuery = useStaffList(page);
  const districtsQuery = useDistrictOptions();
  const createStaff = useCreateStaff();
  const revokeStaff = useRevokeStaff();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleName, setRoleName] = useState('Counsellor');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [createdInfo, setCreatedInfo] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const districtOptions = (districtsQuery.data?.jurisdictions || []).map((j) => ({
    value: j.jurisdictionId, label: j.stateName ? `${j.name}, ${j.stateName}` : j.name,
  }));

  const handleCreate = async () => {
    setError(null);
    setCreatedInfo(null);
    if (!fullName || !email) {
      setError('Full name and email are required.');
      return;
    }
    if (roleName === 'Administration' && !jurisdictionId) {
      setError('A jurisdiction is required for Administration accounts.');
      return;
    }
    try {
      const result = await createStaff.mutateAsync({
        fullName, email, roleName, jurisdictionId: roleName === 'Administration' ? jurisdictionId : undefined,
      });
      setCreatedInfo(`Account created. Temporary password: ${result.tempPassword}`);
      setFullName('');
      setEmail('');
      setJurisdictionId('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeactivate = (officialId, name) => {
    const doRevoke = () => {
      revokeStaff.mutate(officialId, {
        onSuccess: () => toast.success('Account deactivated.'),
        onError: (err) => toast.error(err.message || 'Failed to deactivate account.'),
      });
    };
    Alert.alert('Deactivate account', `This revokes every role ${name} currently holds - they will no longer be able to sign in. Continue?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: doRevoke },
    ]);
  };

  return (
    <View style={styles.container}>
      <Card elevated>
        <Text style={styles.sectionTitle}>Create account</Text>
        <IconInput icon="user" placeholder="Full name" value={fullName} onChangeText={setFullName} />
        <IconInput
          icon="mail"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <View style={styles.chipRow}>
          {ROLE_OPTIONS.map((r) => (
            <Pressable key={r} style={[styles.chip, roleName === r && styles.chipActive]} onPress={() => setRoleName(r)}>
              <Text style={[styles.chipText, roleName === r && styles.chipTextActive]}>{r}</Text>
            </Pressable>
          ))}
        </View>
        {roleName === 'Administration' && (
          <Dropdown options={districtOptions} value={jurisdictionId} onChange={setJurisdictionId} placeholder="District" />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {createdInfo && <Text style={styles.success}>{createdInfo}</Text>}
        <Button title="Create" icon="user-plus" onPress={handleCreate} loading={createStaff.isPending} />
      </Card>

      <Text style={styles.listTitle}>Existing staff</Text>
      <QueryBoundary query={listQuery} empty={(data) => !data?.staff?.length}>
        {(data) => (
          <FlatList
            data={data.staff}
            keyExtractor={(item) => item.officialId}
            renderItem={({ item }) =>
              editingId === item.officialId ? (
                <Card style={styles.row}>
                  <EditStaffRow item={item} onDone={() => setEditingId(null)} />
                </Card>
              ) : (
                <Card style={styles.row}>
                  <View style={styles.rowContent}>
                    <View style={styles.rowInfo}>
                      <Text style={styles.name}>{item.fullName}</Text>
                      <Text style={styles.meta}>{item.email} - {item.roles.map((r) => r.roleName).join(', ') || 'no active role'}</Text>
                    </View>
                    <View style={styles.rowActions}>
                      <Button title="Edit" variant="outline" icon="edit-2" onPress={() => setEditingId(item.officialId)} style={styles.actionButton} />
                      <Button
                        title="Deactivate"
                        icon="user-x"
                        variant="danger"
                        onPress={() => handleDeactivate(item.officialId, item.fullName)}
                        loading={revokeStaff.isPending && revokeStaff.variables === item.officialId}
                        style={styles.actionButton}
                      />
                    </View>
                  </View>
                </Card>
              )
            }
          />
        )}
      </QueryBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.bodySmall, color: colors.textSecondary },
  chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm },
  success: { ...typography.bodySmall, color: colors.success, marginBottom: spacing.sm },
  listTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  row: { marginBottom: spacing.sm },
  rowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowInfo: { flex: 1, marginRight: spacing.sm },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  actionButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  editForm: { gap: spacing.xs },
  editButtonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  halfWidth: { flex: 1 },
});
