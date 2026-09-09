import React, { useState } from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import { Plus, Trash2, Pencil } from 'lucide-react';
import {
  caseTypesResource,
  interventionTypesResource,
  languagesResource,
  channelsResource,
  useJurisdictionOptions,
  usePoliceStationsForDistrict,
  useFetchPoliceStation,
  useCreatePoliceStation,
  useUpdatePoliceStation,
  useDeletePoliceStation,
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
  // Police Stations isn't a drop-in fit for the generic panel below (a
  // station also needs a district) - PoliceStationsPanel is its own
  // component further down instead of a ConfigPanel instance.
  { key: 'policeStations', label: 'Police Stations', resource: null },
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

// Police Stations - district-scoped, so this needs a State -> District
// picker before any list/add UI makes sense (unlike the flat name-only
// lists above). Growing the list happens via "Fetch Station" (simulated -
// see policeStationSimulation.js's own header comment for why), which just
// pre-fills the name field below for review before saving; typing a name
// directly without fetching works identically.
function PoliceStationsPanel() {
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [name, setName] = useState('');
  const [fetchNote, setFetchNote] = useState(null);
  const [formError, setFormError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const stateQuery = useJurisdictionOptions('state');
  const districtQuery = useJurisdictionOptions('district', stateId);
  const stationsQuery = usePoliceStationsForDistrict(districtId);
  const fetchStation = useFetchPoliceStation();
  const createStation = useCreatePoliceStation();
  const updateStation = useUpdatePoliceStation();
  const deleteStation = useDeletePoliceStation();

  const stateOptions = stateQuery.data?.jurisdictions || [];
  const districtOptions = districtQuery.data?.jurisdictions || [];
  const stations = stationsQuery.data?.stations || [];

  const handleFetch = async () => {
    if (!stationCode.trim() || !districtId) return;
    setFormError(null);
    setFetchNote(null);
    try {
      const result = await fetchStation.mutate({ stationCode: stationCode.trim(), jurisdictionId: districtId });
      setName(result.suggestedName);
      setFetchNote(result.note);
    } catch (err) {
      setFormError(err.message || 'Could not fetch a station name.');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !districtId) return;
    try {
      await createStation.mutate({ name: name.trim(), jurisdictionId: districtId });
      setName('');
      setStationCode('');
      setFetchNote(null);
      stationsQuery.refetch();
    } catch (err) {
      setFormError(err.message || 'Could not add this station.');
    }
  };

  const startEdit = (s) => { setEditingId(s.stationId); setEditingName(s.name); };

  const handleSaveEdit = async (stationId) => {
    try {
      await updateStation.mutate(stationId, { name: editingName.trim() });
      setEditingId(null);
      stationsQuery.refetch();
    } catch (err) {
      setFormError(err.message || 'Could not save changes.');
    }
  };

  const handleDelete = async (stationId) => {
    if (!window.confirm('Remove this police station?')) return;
    await deleteStation.mutate(stationId);
    stationsQuery.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">State</label>
          <select
            value={stateId}
            onChange={(e) => { setStateId(e.target.value); setDistrictId(''); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Select...</option>
            {[...stateOptions].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <option key={s.jurisdictionId} value={s.jurisdictionId}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
          <select
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
            disabled={!stateId}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
          >
            <option value="">{stateId ? 'Select...' : 'Select a state first'}</option>
            {[...districtOptions].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
              <option key={d.jurisdictionId} value={d.jurisdictionId}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {districtId && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm">
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value)}
                placeholder="Station code (e.g. AP-ATP-014)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={handleFetch}
                disabled={!stationCode.trim() || fetchStation.loading}
                className="px-3 py-2 border border-[#519BCE] text-[#519BCE] hover:bg-[#EBF4FA] rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                {fetchStation.loading ? 'Fetching...' : 'Fetch Station'}
              </button>
            </div>
            {fetchNote && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{fetchNote}</p>}

            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Station name - fetched above, or type one directly"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="submit"
                disabled={!name.trim() || createStation.loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                <Plus size={14} /> Add
              </button>
            </form>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
          </div>

          <div className="divide-y divide-gray-100">
            {stationsQuery.loading ? (
              <p className="text-sm text-gray-400 p-4">Loading...</p>
            ) : stationsQuery.error ? (
              <p className="text-sm text-rose-600 p-4">{stationsQuery.error}</p>
            ) : stations.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">No stations added for this district yet.</p>
            ) : stations.map((s) => {
              const isEditing = editingId === s.stationId;
              return (
                <div key={s.stationId} className="flex items-center justify-between px-4 py-3 text-sm">
                  {isEditing ? (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm mr-3"
                      autoFocus
                    />
                  ) : (
                    <span className="text-gray-800 font-medium">{s.name}</span>
                  )}
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <button onClick={() => handleSaveEdit(s.stationId)} className="text-xs font-semibold text-[#519BCE] hover:underline">Save</button>
                    ) : (
                      <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-gray-700">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(s.stationId)} className="p-1.5 text-gray-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
        {activeTab === 'policeStations' ? (
          <PoliceStationsPanel key={activeTab} />
        ) : (
          <ConfigPanel
            key={activeTab}
            resource={activeMeta.resource}
            listKey={activeMeta.resource.listKey}
            nameKey={activeMeta.nameKey}
            writeKey={activeMeta.writeKey}
          />
        )}
      </div>
    </MinistryLayout>
  );
}
