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

// Under the SC/ST (PoA) Act there is no post literally named "Protection
// Officer" - the protective function is split between the executive
// magistracy (preventive measures, spot inspection, the district's relief
// and protection duties) and the police (the SC/ST Protection Cell, and
// DySP-and-above investigation). So this list is the executive-magistrate
// and police ranks that actually carry that function at district or
// sub-division level.
//
// Deliberately NOT included, and why:
//   - Tehsildar: the Tehsildar-as-Protection-Officer convention comes from
//     the Protection of Women from Domestic Violence Act, 2005, where states
//     genuinely do appoint Tehsildars/CDPOs as statutory Protection
//     Officers. It is the wrong statute. A Tehsildar also sits BELOW SDM in
//     the revenue hierarchy, and the Act's closest district-level protective
//     post must be not below Sub-Divisional Magistrate rank.
//   - District Social Welfare Officer: a welfare/relief/rehabilitation
//     functionary, which is the District Welfare Officer role in this
//     system - not the physical-protection one.
//
// Two further calls worth stating:
//   - Superintendent of Police is NOT listed here, though the Rules do name
//     the SP alongside the DM for protection arrangements. The SP is the
//     district police chief: realistic as the officer who COMMANDS
//     protection, not as one working a queue of individual protection
//     referrals, which is what this role actually does in this system. SP
//     remains on the Investigating Officer list, where Rule 7's "not below
//     DySP" bar genuinely admits them for a serious case.
//   - "Circle Officer" is carried alongside DySP because that is what the
//     same rank is called in several states (Uttar Pradesh among them), and
//     ACP is its urban-commissionerate equivalent. Same officer, different
//     state nomenclature - listing one label only would read as wrong to
//     half the country.
//
// Every rank below is a sub-division or district-level post, which is why
// this role is district-scoped and never tied to a single police station.
const PROTECTION_OFFICER_DESIGNATIONS = [
  'Deputy Superintendent of Police (DySP) / Circle Officer',
  'Assistant Commissioner of Police (ACP)',
  'Sub-Divisional Magistrate (SDM)',
  'Additional District Magistrate (ADM)',
];

// Deliberately starts at DySP: Rule 7 of the SC/ST (Prevention of
// Atrocities) Rules, 1995 requires that an offence under the Act be
// investigated by a police officer NOT BELOW THE RANK OF DEPUTY
// SUPERINTENDENT OF POLICE. A Sub-Inspector or Inspector - who would
// investigate an ordinary IPC case - legally cannot be the IO here, so
// those ranks are absent by design, not by omission.
const INVESTIGATING_OFFICER_DESIGNATIONS = [
  'Deputy Superintendent of Police (DySP) / Circle Officer',
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
