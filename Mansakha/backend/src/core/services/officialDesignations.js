// The real-world posts that may actually hold each of these roles - one
// source of truth, shared by Ministry's own Staff Management routes
// (ministry.routes.js) and the officer's own Profile (routes/me.js), so the
// two can never drift apart.
//
// Designation is deliberately NOT an authorization boundary: it grants
// nothing. What actually scopes a role - an Investigating Officer's police
// station, a Protection Officer's district - stays Ministry-set and
// read-only to the officer, because those DO determine which cases reach
// their queue. Designation is a descriptive field about the post the
// officer holds, so the officer may set it themselves from their Profile,
// constrained to these lists rather than free text.

// The PoA Act Rules leave "Protection Officer" appointment to state
// government notification rather than naming one fixed post nationally -
// different states have designated a DSP, an SDM, a Tehsildar, or a
// District Social Welfare Officer. Every one of these is a sub-division or
// district-level post, which is why this role is district-scoped and never
// tied to a single police station.
const PROTECTION_OFFICER_DESIGNATIONS = [
  'Deputy Superintendent of Police (DSP)',
  'Sub-Divisional Magistrate (SDM)',
  'Tehsildar',
  'District Social Welfare Officer (DSWO)',
  'Additional District Magistrate (ADM)',
];

// Deliberately starts at DySP: Rule 7 of the SC/ST (Prevention of
// Atrocities) Rules, 1995 requires that an offence under the Act be
// investigated by a police officer NOT BELOW THE RANK OF DEPUTY
// SUPERINTENDENT OF POLICE. A Sub-Inspector or Inspector - who would
// investigate an ordinary IPC case - legally cannot be the IO here, so
// those ranks are absent by design, not by omission.
const INVESTIGATING_OFFICER_DESIGNATIONS = [
  'Deputy Superintendent of Police (DySP)',
  'Assistant Commissioner of Police (ACP)',
  'Additional Superintendent of Police (Addl. SP)',
  'Superintendent of Police (SP)',
];

// Roles absent from this map don't carry a designation at all.
const DESIGNATIONS_BY_ROLE = {
  'Protection Officer': PROTECTION_OFFICER_DESIGNATIONS,
  'Investigating Officer': INVESTIGATING_OFFICER_DESIGNATIONS,
};

module.exports = {
  PROTECTION_OFFICER_DESIGNATIONS,
  INVESTIGATING_OFFICER_DESIGNATIONS,
  DESIGNATIONS_BY_ROLE,
};
