import React, { useState } from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import { Plus, Trash2, Pencil } from 'lucide-react';
import {
  caseTypesResource,
  interventionTypesResource,
  languagesResource,
  channelsResource,
} from '../services/hooks';

const TABS = [
  { key: 'caseTypes', label: 'Case Types', resource: caseTypesResource },
  { key: 'interventionTypes', label: 'Intervention Types', resource: interventionTypesResource },
  { key: 'languages', label: 'Languages', resource: languagesResource },
  // Channels' GET returns channel_name (raw column name, unlike the other
  // three which happen to use the bare column `name`) while its POST/PATCH
  // body field is channelName - nameKey/writeKey let this one tab plug into
  // the same generic panel without forcing the other three's shape to change.
  { key: 'channels', label: 'Channels', resource: channelsResource, nameKey: 'channel_name', writeKey: 'channelName' },
];

// Internal tooling, not a public page - plain list + inline add/edit/delete
// per section, matching the density of the rest of the Ministry console
// rather than reaching for anything more polished than it needs to be.
function ConfigPanel({ resource, listKey, nameKey = 'name', writeKey = 'name' }) {
  const { data, loading, error, refetch } = resource.useList();
  const create = resource.useCreate();
  const update = resource.useUpdate();
  const remove = resource.useDelete();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [formError, setFormError] = useState(null);

  const items = data?.[listKey] || [];

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!newName.trim()) return;
    try {
      await create.mutate({ [writeKey]: newName.trim() });
      setNewName('');
      refetch();
    } catch (err) {
      setFormError(err.message || 'Could not add this item.');
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id || item[Object.keys(item)[0]]);
    setEditingName(item[nameKey]);
  };

  const handleSaveEdit = async (id) => {
    try {
      await update.mutate(id, { [writeKey]: editingName.trim() });
      setEditingId(null);
      refetch();
    } catch (err) {
      setFormError(err.message || 'Could not save changes.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this item?')) return;
    await remove.mutate(id);
    refetch();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm">
      <form onSubmit={handleCreate} className="flex gap-2 p-4 border-b border-gray-100">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add new..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          type="submit"
          disabled={create.loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
        >
          <Plus size={14} /> Add
        </button>
      </form>

      {formError && <p className="text-xs text-rose-600 px-4 pt-2">{formError}</p>}

      <div className="divide-y divide-gray-100">
        {loading ? (
          <p className="text-sm text-gray-400 p-4">Loading...</p>
        ) : error ? (
          <p className="text-sm text-rose-600 p-4">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">Nothing here yet.</p>
        ) : items.map((item) => {
          const id = item.id || Object.values(item)[0];
          const isEditing = editingId === id;
          return (
            <div key={id} className="flex items-center justify-between px-4 py-3 text-sm">
              {isEditing ? (
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm mr-3"
                  autoFocus
                />
              ) : (
                <span className="text-gray-800 font-medium">{item[nameKey]}</span>
              )}
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <button onClick={() => handleSaveEdit(id)} className="text-xs font-semibold text-[#519BCE] hover:underline">Save</button>
                ) : (
                  <button onClick={() => startEdit(item)} className="p-1.5 text-gray-400 hover:text-gray-700">
                    <Pencil size={14} />
                  </button>
                )}
                <button onClick={() => handleDelete(id)} className="p-1.5 text-gray-400 hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SystemConfig() {
  const [activeTab, setActiveTab] = useState('caseTypes');
  const activeMeta = TABS.find((t) => t.key === activeTab);

  return (
    <MinistryLayout title="System Configuration">
      <div className="space-y-4">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === tab.key ? 'bg-[#519BCE]/15 text-[#519BCE]' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* key forces a remount per tab, rather than relying on all four
            resources' hooks happening to be shaped identically call-for-call. */}
        <ConfigPanel
          key={activeTab}
          resource={activeMeta.resource}
          listKey={activeMeta.resource.listKey}
          nameKey={activeMeta.nameKey}
          writeKey={activeMeta.writeKey}
        />
      </div>
    </MinistryLayout>
  );
}
