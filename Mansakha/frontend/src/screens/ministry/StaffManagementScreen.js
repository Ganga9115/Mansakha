import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import IconInput from '../../components/IconInput';
import Dropdown from '../../components/Dropdown';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Section from '../../components/Section';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useToast } from '../../context/ToastContext';
import { useStaffList, useCreateStaff, useRevokeStaff, useUpdateStaff, useDistrictOptions } from '../../services/hooks';

const ROLE_OPTIONS = ['Administration', 'Counsellor'];

// "Delete" is deliberately not a hard delete - officials has live FK
// references (interventions, audit_log, official_roles.assigned_by) that
// removing the row would break. Revoking every active role already fully
// locks the account out (verifyToken re-checks roles on every request), so
// this button IS the delete/deactivate action, just correctly labeled -
// and "Status" in the table below reflects it directly (Active vs
// Deactivated, derived from whether any role survives).
export default function StaffManagementScreen() {
  const toast = useToast();
  const [page] = useState(1);
  const listQuery = useStaffList(page);
  const districtsQuery = useDistrictOptions();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const revokeStaff = useRevokeStaff();

  const [editingItem, setEditingItem] = useState(null); // null = Create mode, else Edit mode
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleName, setRoleName] = useState('Counsellor');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [createdInfo, setCreatedInfo] = useState(null);
  const [error, setError] = useState(null);

  const districtOptions = (districtsQuery.data?.jurisdictions || []).map((j) => ({
    value: j.jurisdictionId, label: j.stateName ? `${j.name}, ${j.stateName}` : j.name,
  }));

  const resetForm = () => {
    setEditingItem(null); setFullName(''); setEmail(''); setPhone(''); setJurisdictionId(''); setError(null); setCreatedInfo(null);
  };

  const startEdit = (item) => {
    setEditingItem(item);
    setFullName(item.fullName);
    setPhone(item.phone || '');
    setError(null);
    setCreatedInfo(null);
  };

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

  const handleSaveEdit = async () => {
    setError(null);
    try {
      await updateStaff.mutateAsync({ officialId: editingItem.officialId, fullName, phone });
      toast.success('Account updated.');
      resetForm();
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

  const columns = [
    { key: 'fullName', label: 'Name', flex: 1.2, render: (item) => <Text style={styles.cellStrong}>{item.fullName}</Text> },
    { key: 'email', label: 'Email', flex: 1.4, render: (item) => <Text style={styles.cell}>{item.email}</Text> },
    { key: 'roles', label: 'Role(s)', flex: 1.1, render: (item) => <Text style={styles.cell}>{item.roles.map((r) => r.roleName).join(', ') || '-'}</Text> },
    { key: 'status', label: 'Status', flex: 0.8, render: (item) => <StatusBadge status={item.roles.length > 0 ? 'Active' : 'Deactivated'} /> },
    {
      key: 'actions', label: 'Actions', flex: 1.3,
      render: (item) => (
        <View style={styles.rowActions}>
          <Button title="Edit" variant="outline" icon="edit-2" onPress={() => startEdit(item)} style={styles.actionButton} />
          <Button
            title="Deactivate"
            icon="user-x"
            variant="danger"
            onPress={() => handleDeactivate(item.officialId, item.fullName)}
            loading={revokeStaff.isPending && revokeStaff.variables === item.officialId}
            style={styles.actionButton}
          />
        </View>
      ),
    },
  ];

  return (
    <ScreenContainer>
      <Section eyebrow="Provisioning" title={editingItem ? `Edit account - ${editingItem.fullName}` : 'Create account'}>
        <Card headerTitle={editingItem ? 'Account details' : 'New official'}>
          <IconInput icon="user" placeholder="Full name" value={fullName} onChangeText={setFullName} />
          {editingItem ? (
            <IconInput icon="phone" placeholder="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          ) : (
            <>
              <IconInput icon="mail" placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
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
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          {createdInfo && <Text style={styles.success}>{createdInfo}</Text>}
          <View style={styles.formButtonRow}>
            {editingItem && <Button title="Cancel" variant="outline" onPress={resetForm} style={styles.halfWidth} />}
            <Button
              title={editingItem ? 'Save' : 'Create'}
              icon={editingItem ? undefined : 'user-plus'}
              onPress={editingItem ? handleSaveEdit : handleCreate}
              loading={editingItem ? updateStaff.isPending : createStaff.isPending}
              style={editingItem ? styles.halfWidth : undefined}
            />
          </View>
        </Card>
      </Section>

      <Section eyebrow="Directory" title="Existing staff">
        <QueryBoundary query={listQuery} empty={(data) => !data?.staff?.length}>
          {(data) => (
            <DataTable columns={columns} data={data.staff} keyExtractor={(item) => item.officialId} emptyMessage="No staff accounts yet." emptyIcon="users" />
          )}
        </QueryBoundary>
      </Section>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { ...typography.bodySmall, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm },
  success: { ...typography.bodySmall, color: colors.success, marginBottom: spacing.sm },
  cellStrong: { ...typography.bodyStrong, color: colors.textPrimary },
  cell: { ...typography.body, color: colors.textPrimary },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  formButtonRow: { flexDirection: 'row', gap: spacing.md },
  halfWidth: { flex: 1 },
});
