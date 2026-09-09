-- Two real-world corrections to intervention_types, found on inspection:
--
-- 1. 'Rehabilitation' is a dead-end today - it's offered to victims in the
--    request form (GET /intervention-types), but NO role's queue ever
--    reviews it (only Legal Aid -> DLSA, Financial Assistance/Medical ->
--    DWO, Witness Protection/Relocation -> Protection Officer are mounted
--    via mountInterventionReviewRoutes - confirmed by grep across every
--    routes.js file). A victim selecting it would sit at 'Pending' forever.
--    The REAL, working Rehabilitation flow is the dedicated, stage-gated
--    opt-in (user.routes.js's POST /rehabilitation-opt-in, reachable once
--    case_stage = 'Rehabilitation' - migration_034), which this generic
--    proof-upload path never fed into anyway. Soft-deleted here so it stops
--    being offered.
--
-- 2. required_documents overcorrected toward bureaucracy in a few places -
--    grounded correction against the actual schemes:
--    - Medical: this is meant to be URGENT support (Section 357C CrPC's
--      mandatory free/immediate treatment duty) - a victim requesting it
--      cannot possibly already hold a diagnosis report for treatment they
--      haven't received yet. No longer required.
--    - Witness Protection: this app's own Protection Registry already
--      receives the exact same class of case with ZERO proof requirement
--      via Emergency SOS and self-reported Threat Report - requiring proof
--      only on THIS specific path was an inconsistency, not a real rule.
--      FIR reference is already implicit in the case's own existing
--      registration. No longer required.
--    - Financial Assistance / Legal Aid: both are relief the case's own
--      existing SC/ST-atrocity registration already establishes eligibility
--      for (Financial Assistance under the Dr. Ambedkar National Relief
--      Scheme; Legal Aid is an AUTOMATIC, unconditional entitlement for an
--      SC/ST person under Section 12(c) of the Legal Services Authorities
--      Act, 1987 - no means or merit test at all). Re-demanding a caste
--      certificate/FIR copy the case already implies is bureaucratic
--      friction the actual law doesn't impose. Bank Passbook stays required
--      for Financial Assistance (a real operational necessity for DBT).
--    - Relocation stays proof-gated (Proof of Current Address required) -
--      a genuinely resource-intensive commitment that warrants
--      verification, unlike the above.
update intervention_types set deleted_at = now() where name = 'Rehabilitation' and deleted_at is null;

update intervention_types set required_documents =
  '[{"label":"Medical Certificate / Diagnosis Report","required":false},{"label":"Hospital Bill or Treatment Estimate","required":false}]'::jsonb
  where name = 'Medical';

update intervention_types set required_documents =
  '[{"label":"FIR Copy / Case Reference","required":false},{"label":"Police Threat Assessment","required":false}]'::jsonb
  where name = 'Witness Protection';

update intervention_types set required_documents =
  '[{"label":"FIR Copy / Case Reference","required":false},{"label":"Police Threat Assessment or Recommendation","required":false},{"label":"Proof of Current Address","required":true}]'::jsonb
  where name = 'Relocation';

update intervention_types set required_documents =
  '[{"label":"FIR Copy","required":false},{"label":"Caste Certificate (SC/ST Proof)","required":false},{"label":"Bank Passbook / Account Proof","required":true}]'::jsonb
  where name = 'Financial Assistance';

update intervention_types set required_documents =
  '[{"label":"Caste Certificate (SC/ST Proof)","required":false},{"label":"FIR Copy / Case Reference","required":false},{"label":"Aadhaar or Photo ID","required":false}]'::jsonb
  where name = 'Legal Aid';
