// Integration test against the live Supabase DB's `jurisdictions` table (not
// mocked) - a stronger check of "does jurisdiction isolation actually hold" than a
// mocked unit test would be, since a mock can silently drift from what the real
// parent-chain data looks like. Creates a small disposable test tree and tears it
// down afterward; doesn't touch any other table.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { supabase } = require('../db/supabaseClient');
const { requireJurisdiction } = require('./requireJurisdiction');
const { requireRole } = require('./requireRole');

function makeReqRes(auth, params = {}) {
  const req = { auth, params };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  return { req, res, getStatus: () => statusCode, getBody: () => body };
}

let ids = {};

test.before(async () => {
  const insert = async (name, level, parentId) => {
    const { data, error } = await supabase.from('jurisdictions').insert({ name, level, parent_id: parentId }).select('jurisdiction_id').single();
    if (error) throw error;
    return data.jurisdiction_id;
  };
  ids.national = await insert('TEST National', 'national', null);
  ids.stateA = await insert('TEST State A', 'state', ids.national);
  ids.districtA1 = await insert('TEST District A1', 'district', ids.stateA);
  ids.stateB = await insert('TEST State B', 'state', ids.national);
  ids.districtB1 = await insert('TEST District B1', 'district', ids.stateB);
});

test.after(async () => {
  await supabase.from('jurisdictions').delete().in('jurisdiction_id', [ids.districtA1, ids.districtB1, ids.stateA, ids.stateB, ids.national]);
});

test('District-scoped caller is denied a different district', async () => {
  const auth = { type: 'official', roles: [{ roleName: 'Administration', jurisdictionId: ids.districtA1 }] };
  const { req, res, getStatus } = makeReqRes(auth, { jurisdictionId: ids.districtB1 });
  let nextCalled = false;
  await requireJurisdiction((r) => r.params.jurisdictionId)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
});

test('District-scoped caller is allowed their own district', async () => {
  const auth = { type: 'official', roles: [{ roleName: 'Administration', jurisdictionId: ids.districtA1 }] };
  const { req, res } = makeReqRes(auth, { jurisdictionId: ids.districtA1 });
  let nextCalled = false;
  await requireJurisdiction((r) => r.params.jurisdictionId)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('State-scoped caller is allowed a child district', async () => {
  const auth = { type: 'official', roles: [{ roleName: 'Administration', jurisdictionId: ids.stateA }] };
  const { req, res } = makeReqRes(auth, { jurisdictionId: ids.districtA1 });
  let nextCalled = false;
  await requireJurisdiction((r) => r.params.jurisdictionId)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('State-scoped caller is denied a sibling state\'s district', async () => {
  const auth = { type: 'official', roles: [{ roleName: 'Administration', jurisdictionId: ids.stateA }] };
  const { req, res, getStatus } = makeReqRes(auth, { jurisdictionId: ids.districtB1 });
  let nextCalled = false;
  await requireJurisdiction((r) => r.params.jurisdictionId)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
});

test('Ministry bypasses the jurisdiction check entirely (unrestricted, per Section 3)', async () => {
  const auth = { type: 'official', roles: [{ roleName: 'Ministry', jurisdictionId: null }] };
  const { req, res } = makeReqRes(auth, { jurisdictionId: ids.districtB1 });
  let nextCalled = false;
  await requireJurisdiction((r) => r.params.jurisdictionId)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireJurisdiction rejects a non-official (user) caller', async () => {
  const auth = { type: 'user', userId: 'irrelevant' };
  const { req, res, getStatus } = makeReqRes(auth, { jurisdictionId: ids.districtA1 });
  let nextCalled = false;
  await requireJurisdiction((r) => r.params.jurisdictionId)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
});

test('requireRole allows a matching role', () => {
  const auth = { type: 'official', roles: [{ roleName: 'Counsellor', jurisdictionId: ids.districtA1 }] };
  const { req, res } = makeReqRes(auth);
  let nextCalled = false;
  requireRole(['Counsellor', 'Administration'])(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireRole denies a non-matching role', () => {
  const auth = { type: 'official', roles: [{ roleName: 'Counsellor', jurisdictionId: ids.districtA1 }] };
  const { req, res, getStatus } = makeReqRes(auth);
  let nextCalled = false;
  requireRole(['Ministry'])(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
});
