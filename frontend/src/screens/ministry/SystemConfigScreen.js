import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import IconInput from '../../components/IconInput';
import { QueryBoundary } from '../../components/QueryStates';
import { useToast } from '../../context/ToastContext';
import { useLanguages, useAddLanguage, useUpdateLanguage, useDeleteLanguage } from '../../services/hooks';

function EditLanguageRow({ item, onDone }) {
  const toast = useToast();
  const updateLanguage = useUpdateLanguage();
  const [code, setCode] = useState(item.code);
  const [name, setName] = useState(item.name);

  const save = async () => {
    try {
      await updateLanguage.mutateAsync({ languageId: item.language_id, code, name });
      toast.success('Language updated.');
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <View style={styles.editForm}>
      <IconInput icon="tag" placeholder="Code" value={code} onChangeText={setCode} autoCapitalize="none" />
      <IconInput icon="globe" placeholder="Name" value={name} onChangeText={setName} />
      <View style={styles.editButtonRow}>
        <Button title="Cancel" variant="outline" onPress={onDone} style={styles.halfWidth} />
        <Button title="Save" onPress={save} loading={updateLanguage.isPending} style={styles.halfWidth} />
      </View>
    </View>
  );
}

// case_types/intervention_types/channels stay fixed per the PS's own definitions
// (Build Prompt Section 6) - languages is the one lookup table Section 4.1
// explicitly wants runtime-extensible, so that's what System Configuration covers.
export default function SystemConfigScreen() {
  const toast = useToast();
  const query = useLanguages();
  const addLanguage = useAddLanguage();
  const deleteLanguage = useDeleteLanguage();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);

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

  return (
    <View style={styles.container}>
      <Card elevated>
        <Text style={styles.sectionTitle}>Add language</Text>
        <IconInput icon="tag" placeholder="Code (e.g. gu)" value={code} onChangeText={setCode} autoCapitalize="none" />
        <IconInput icon="globe" placeholder="Name (e.g. Gujarati)" value={name} onChangeText={setName} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title="Add" icon="plus" onPress={handleAdd} loading={addLanguage.isPending} />
      </Card>

      <Text style={styles.listTitle}>Supported languages</Text>
      <QueryBoundary query={query} empty={(data) => !data?.languages?.length}>
        {(data) => (
          <FlatList
            data={data.languages}
            keyExtractor={(item) => item.language_id}
            renderItem={({ item }) =>
              editingId === item.language_id ? (
                <Card style={styles.row}>
                  <EditLanguageRow item={item} onDone={() => setEditingId(null)} />
                </Card>
              ) : (
                <Card style={styles.row}>
                  <View style={styles.rowContent}>
                    <View>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>{item.code}</Text>
                    </View>
                    <View style={styles.rowActions}>
                      <Button title="Edit" variant="outline" icon="edit-2" onPress={() => setEditingId(item.language_id)} style={styles.actionButton} />
                      <Button
                        title="Remove"
                        icon="trash-2"
                        variant="danger"
                        onPress={() => handleDelete(item.language_id, item.name)}
                        loading={deleteLanguage.isPending && deleteLanguage.variables === item.language_id}
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
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm },
  listTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  row: { marginBottom: spacing.sm },
  rowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  actionButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  editForm: { gap: spacing.xs },
  editButtonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  halfWidth: { flex: 1 },
});
