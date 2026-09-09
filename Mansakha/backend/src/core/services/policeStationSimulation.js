// Police Station "Fetch by ID" - EXPLICITLY SIMULATED, same honesty
// discipline as courtCaseSimulation.js and dataoperator.routes.js's own
// POST /fetch-case: no free/official registry of every police station in
// India exists to plug into, so this generates a deterministic, plausible-
// looking station name instead of pretending to hit a real lookup. Every
// result must carry a clear "Simulated data" label wherever it's shown,
// same requirement as those two.
//
// Naming grounded in real Indian police-station conventions, not invented
// wholesale: "Kotwali" (the historic main/oldest station of a city, common
// especially in North India), "Sadar" ("headquarters/main"), and
// Town/City/Rural/Cantonment suffixes distinguishing the urban core from
// the surrounding rural jurisdiction within one district - all real,
// widely-used terms, just combined with a generated locality name here
// rather than a real one.

const LOCALITY_PREFIXES = [
  'Civil Lines', 'Gandhi Nagar', 'Model Town', 'Ashok Nagar', 'Shastri Nagar',
  'Rajiv Nagar', 'Nehru Colony', 'Ramnagar', 'Vivek Vihar', 'Industrial Area',
  'Old Bus Stand', 'New Colony', 'Market Yard', 'Station Road',
];

// Real, standard suffix patterns - which one applies depends on the seed,
// not the actual station (there's no way to know a real station's true
// jurisdiction type without a real registry).
const STATION_SUFFIXES = ['Kotwali', 'Sadar', 'Town PS', 'City PS', 'Rural PS', 'Cantonment PS'];

function seedFor(stationCode) {
  return String(stationCode).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

// Deterministic per (stationCode, districtName) - the same code always
// "fetches" the same plausible name for a given district, same technique
// as courtCaseSimulation.js's own seedFor.
function generateSimulatedStationName({ stationCode, districtName }) {
  const seed = seedFor(stationCode);
  const suffix = STATION_SUFFIXES[seed % STATION_SUFFIXES.length];

  // "Kotwali"/"Sadar" name the district/town itself ("Anantapur Kotwali"),
  // matching how those terms are actually used - the others pair with a
  // generated locality name instead ("Civil Lines Town PS, Anantapur").
  if (suffix === 'Kotwali' || suffix === 'Sadar') {
    return `${districtName} ${suffix}`;
  }
  const locality = LOCALITY_PREFIXES[(seed * 7) % LOCALITY_PREFIXES.length];
  return `${locality} ${suffix}, ${districtName}`;
}

module.exports = { generateSimulatedStationName };
