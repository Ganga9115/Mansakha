const { pool } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');
const { isCourtCaseEligible, generateCnrNumber, generateSimulatedCourtCaseDetails } = require('./courtCaseSimulation');

// DB-orchestration wrapper around courtCaseSimulation.js's pure generators -
// kept in a separate file deliberately, since that file's own header comment
// requires every function there to stay pure (no DB/network calls), so a
// real eCourts integration later only has to replace the call site here, not
// touch the generator's data shape.
//
// Extracted from user.routes.js's GET /court-case/:userId (unchanged
// behaviour there - same stale-after-12h refresh, same upsert) so a second
// caller (legalRepresentative.routes.js's hearings-upcoming, which needs the
// SAME "does this case have a real upcoming hearing date" fact for each of
// a Public Prosecutor's own cases) doesn't duplicate ~80 lines of upsert logic.
const COURT_CASE_STALE_HOURS = 12;

// Returns { available: false, reason } if the case hasn't reached a stage
// where court data is realistic yet, or { available: true, row } with the
// current (possibly freshly-regenerated) court_case_details row otherwise.
async function ensureCourtCaseDetails({ userId, caseStage, docketNumber, cnrNumber, caseTypeName, jurisdictionName, enrolledAt, victimFullName }) {
  if (!isCourtCaseEligible(caseStage)) {
    return { available: false, reason: 'Court case details become available once this case reaches Trial stage.' };
  }

  const { rows: existingRows } = await pool.query(
    `select detail_id, user_id, cnr_number, case_type, case_category, case_sub_category,
            filing_number, filing_date::text as filing_date, registration_number, registration_date::text as registration_date,
            court_complex, court_establishment, court_number, coram, case_stage_label,
            first_hearing_date::text as first_hearing_date, next_hearing_date::text as next_hearing_date, next_hearing_purpose,
            case_status, decision_date::text as decision_date, disposal_nature,
            petitioner_names, respondent_names, advocate_names, acts_sections,
            fir_police_station, fir_number, fir_year, ia_details, hearing_history, orders,
            connected_cases, originating_case_number, transfer_history, objections, hearing_mode,
            sync_source, last_synced_at
     from court_case_details
     where user_id = $1
     limit 1`,
    [userId]
  );
  const existing = existingRows[0];
  const isStale = !existing || (Date.now() - new Date(existing.last_synced_at).getTime()) / 3600000 > COURT_CASE_STALE_HOURS;

  let row = existing;
  if (isStale) {
    const resolvedCnr = cnrNumber || generateCnrNumber(docketNumber, jurisdictionName);
    // migration_045: caseStage is no longer passed - the generator computes
    // everything (including whether the case is Disposed) purely from its
    // own dates now, independent of NHaa's case_stage. caseStage is still
    // used above only to gate whether this function runs at all
    // (isCourtCaseEligible).
    const generated = generateSimulatedCourtCaseDetails({
      docketNumber, cnrNumber: resolvedCnr, caseTypeName, jurisdictionName, enrolledAt, victimFullName,
    });

    const upsertPayload = {
      user_id: userId,
      cnr_number: generated.cnrNumber,
      case_type: generated.caseType,
      case_category: generated.caseCategory,
      case_sub_category: generated.caseSubCategory,
      filing_number: generated.filingNumber,
      filing_date: generated.filingDate,
      registration_number: generated.registrationNumber,
      registration_date: generated.registrationDate,
      court_complex: generated.courtComplex,
      court_establishment: generated.courtEstablishment,
      court_number: generated.courtNumber,
      coram: generated.coram,
      case_stage_label: generated.caseStageLabel,
      first_hearing_date: generated.firstHearingDate,
      next_hearing_date: generated.nextHearingDate,
      next_hearing_purpose: generated.nextHearingPurpose,
      case_status: generated.caseStatus,
      decision_date: generated.decisionDate,
      disposal_nature: generated.disposalNature,
      petitioner_names: generated.petitionerNames,
      respondent_names: generated.respondentNames,
      advocate_names: generated.advocateNames,
      acts_sections: generated.actsSections,
      fir_police_station: generated.firPoliceStation,
      fir_number: generated.firNumber,
      fir_year: generated.firYear,
      ia_details: generated.iaDetails,
      hearing_history: generated.hearingHistory,
      orders: generated.orders,
      connected_cases: generated.connectedCases,
      originating_case_number: generated.originatingCaseNumber,
      transfer_history: generated.transferHistory,
      objections: generated.objections,
      hearing_mode: generated.hearingMode,
      sync_source: 'simulated',
      last_synced_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('court_case_details')
      .upsert(upsertPayload, { onConflict: 'user_id' })
      .select('*')
      .single();
    if (upsertError) throw new Error(`Could not load court case details: ${upsertError.message}`);
    row = upserted;

    if (!cnrNumber) {
      await supabase.from('users').update({ cnr_number: generated.cnrNumber }).eq('user_id', userId);
    }
  }

  return { available: true, row };
}

module.exports = { ensureCourtCaseDetails, COURT_CASE_STALE_HOURS };
