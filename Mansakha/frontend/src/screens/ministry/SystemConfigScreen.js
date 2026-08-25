import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import IconInput from '../../components/IconInput';
import DataTable from '../../components/DataTable';
import Section from '../../components/Section';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useToast } from '../../context/ToastContext';
import { useLanguages, useAddLanguage, useUpdateLanguage, useDeleteLanguage } from '../../services/hooks';

// case_types/intervention_types/channels stay fixed per the PS's own definitions
// (Build Prompt Section 6) - languages is the one lookup table Section 4.1
// explicitly wants runtime-extensible, so that's what System Configuration covers.
export default function SystemConfigScreen() {
  const toast = useToast();
  const query = useLanguages();
  const addLanguage = useAddLanguage();
  const updateLanguage = useUpdateLanguage();
  const deleteLanguage = useDeleteLanguage();

  const [editingItem, setEditingItem] = useState(null); // null = Add mode
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const resetForm = () => { setEditingItem(null); setCode(''); setName(''); setError(null); };

  const startEdit = (item) => {
    setEditingItem(item);
    setCode(item.code);
    setName(item.name);
    setError(null);
  };

  const handleAdd = async () => {
    setError(null);
    if (!code || !name) {
      setError('Both code and name are required.');
      return;
    }
    try {
      await addLanguage.mutateAsync({ code, name });
      toast.success(`${name} added to supported languages.`);
      setCode('');
      setName('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveEdit = async () => {
    setError(null);
    try {
      await updateLanguage.mutateAsync({ languageId: editingItem.language_id, code, name });
      toast.success('Language updated.');
      resetForm();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = (languageId, name) => {
    const doDelete = () => {
      deleteLanguage.mutate(languageId, {
        onSuccess: () => toast.success(`${name} removed from supported languages.`),
        onError: (err) => toast.error(err.message || 'Failed to remove language.'),
      });
    };
    // Soft-delete server-side: a victim who already picked this language keeps
    // working, it just stops being offered as a new choice - safe to remove
    // without a scarier warning about breaking existing records.
    Alert.alert('Remove language', `Remove ${name} from the selectable list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doDelete },
    ]);
  };

  const columns = [
    { key: 'name', label: 'Name', flex: 1.2, render: (item) => <Text style={styles.cellStrong}>{item.name}</Text> },
    { key: 'code', label: 'Code', flex: 0.8, render: (item) => <Text style={styles.cell}>{item.code}</Text> },
    {
      key: 'actions', label: 'Actions', flex: 1.3,
      render: (item) => (
        <View style={styles.rowActions}>
          <Button title="Edit" variant="outline" icon="edit-2" onPress={() => startEdit(item)} style={styles.actionButton} />
          <Button
            title="Remove"
            icon="trash-2"
            variant="danger"
            onPress={() => handleDelete(item.language_id, item.name)}
            loading={deleteLanguage.isPending && deleteLanguage.variables === item.language_id}
            style={styles.actionButton}
          />
        </View>
      ),
    },
  ];

  return (
    <ScreenContainer>
      <Section eyebrow="Lookup data" title={editingItem ? `Edit language - ${editingItem.name}` : 'Add language'}>
        <Card headerTitle={editingItem ? 'Language details' : 'New language'}>
          <IconInput icon="tag" placeholder="Code (e.g. gu)" value={code} onChangeText={setCode} autoCapitalize="none" />
          <IconInput icon="globe" placeholder="Name (e.g. Gujarati)" value={name} onChangeText={setName} />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            title={editingItem ? 'Save' : 'Add'}
            icon={editingItem ? undefined : 'plus'}
            onPress={editingItem ? handleSaveEdit : handleAdd}
            loading={editingItem ? updateLanguage.isPending : addLanguage.isPending}
          />
          {editingItem && <Button title="Cancel" variant="outline" onPress={resetForm} style={styles.cancelButton} />}
        </Card>
      </Section>

      <Section eyebrow="Directory" title="Supported languages">
        <QueryBoundary query={query} empty={(data) => !data?.languages?.length}>
          {(data) => (
            <DataTable columns={columns} data={data.languages} keyExtractor={(item) => item.language_id} emptyMessage="No languages configured yet." emptyIcon="globe" />
          )}
        </QueryBoundary>
      </Section>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm },
  cellStrong: { ...typography.bodyStrong, color: colors.textPrimary },
  cell: { ...typography.body, color: colors.textPrimary },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  cancelButton: { marginTop: spacing.sm },
});
