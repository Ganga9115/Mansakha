const { pool, withTransaction } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');
const { writeAuditLog } = require('./auditLog');
const { ok, fail } = require('./responseEnvelope');

const STATUSES = ['Pending', 'Accepted', 'Rejected'];

// Specialist counterpart to district_admin's own generic Administration-only
// intervention-request review routes. Real-world grounding: a District
// Welfare Officer is who actually verifies SC/ST atrocity Financial
// Assistance proof, a DLSA Coordinator verifies Legal Aid eligibility, a
// Protection Officer verifies Witness Protection/Relocation need - not a
// generalist Administrator deciding on all of them. District Admin keeps
// its own GET routes for oversight visibility, but no longer decides on
// these specific types (see districtAdmin.routes.js's own decision route,
// now scoped away from types this module covers).
//
// Mounted onto an ALREADY role-scoped router (verifyToken + requireRole +
// rate-limiter already applied via that router's own router.use) - this
// only adds 3 routes, matching the shape of district_admin's own 3
// (GET list, GET detail, PATCH decision).
//
// Accepting inserts the interventions row exactly as District Admin's own
// route always has (so the Reports feature's Intervention Summary keeps
// working unmodified), THEN - as a separate, best-effort step, matching
// this codebase's existing non-atomic hand-off convention (e.g. dwo.routes.js's
// hand-off-rehabilitation) - creates a fresh agency_referral to this same
// role, carrying the intervention_request's own id in metadata for
// traceability. This is the one link that never existed before: a
// proof-verified request now flows straight into the reviewing role's own
// existing referral workflow (Immediate Relief, assign-lawyer, threat
// tier) instead of dead-ending as just an `interventions` row.
function mountInterventionReviewRoutes(router, { roleName, interventionTypeNames, jurisdictionScoped = false }) {
  function getOwnJurisdictionId(req) {
    const role = req.auth.roles.find((r) => r.roleName === roleName);
    return role?.jurisdictionId || null;
  }

  router.get('/intervention-requests', async (req, res) => {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) return fail(res, `status must be one of: ${STATUSES.join(', ')}`, 400);

    let jurisdictionId = null;
    if (jurisdictionScoped) {
      jurisdictionId = getOwnJurisdictionId(req);
      if (!jurisdictionId) return ok(res, { requests: [], jurisdictionAssigned: false });
    }

    const params = [interventionTypeNames];
    let where = `it.name = any($1::text[])`;
    if (status) { params.push(status); where += ` and ir.status = $${params.length}`; }
    if (jurisdictionScoped) { params.push(jurisdictionId); where += ` and u.jurisdiction_id = $${params.length}`; }

    const { rows } = await pool.query(
      `select ir.request_id, ir.description, ir.status, ir.decision_reason, ir.requested_at, ir.reviewed_at,
              u.docket_number, u.case_stage, ct.name as case_type_name, it.name as intervention_type_name
       from intervention_requests ir
       join users u on u.user_id = ir.user_id
       join case_types ct on ct.case_type_id = u.case_type_id
       join intervention_types it on it.intervention_type_id = ir.intervention_type_id
       where ${where}
       order by ir.requested_at desc`,
      params
    );

    return ok(res, {
      requests: rows.map((r) => ({
        requestId: r.request_id,
        docketNumber: r.docket_number,
        caseStage: r.case_stage,
        caseTypeName: r.case_type_name,
        interventionTypeName: r.intervention_type_name,
        description: r.description,
        status: r.status,
        decisionReason: r.decision_reason,
        requestedAt: r.requested_at,
        reviewedAt: r.reviewed_at,
      })),
      ...(jurisdictionScoped ? { jurisdictionAssigned: true } : {}),
    });
  });

  router.get('/intervention-requests/:requestId', async (req, res) => {
    const { rows } = await pool.query(
      `select ir.request_id, ir.description, ir.status, ir.decision_reason, ir.requested_at, ir.reviewed_at,
              u.jurisdiction_id, u.docket_number, u.case_stage, ct.name as case_type_name, it.name as intervention_type_name
       from intervention_requests ir
       join users u on u.user_id = ir.user_id
       join case_types ct on ct.case_type_id = u.case_type_id
       join intervention_types it on it.intervention_type_id = ir.intervention_type_id
       where ir.request_id = $1`,
      [req.params.requestId]
    );
    const r = rows[0];
    if (!r || !interventionTypeNames.includes(r.intervention_type_name)) return fail(res, 'Request not found', 404);
    if (jurisdictionScoped && r.jurisdiction_id !== getOwnJurisdictionId(req)) return fail(res, 'Request not found', 404);

    const { rows: docRows } = await pool.query(
      'select document_id, document_label, storage_path from intervention_request_documents where request_id = $1',
      [req.params.requestId]
    );
    const documents = await Promise.all(docRows.map(async (d) => {
      const { data, error } = await supabase.storage.from('intervention-proofs').createSignedUrl(d.storage_path, 3600);
      return { documentLabel: d.document_label, signedUrl: error ? null : data.signedUrl };
    }));

    await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'intervention_request', entityId: req.params.requestId });

    return ok(res, {
      requestId: r.request_id,
      docketNumber: r.docket_number,
      caseStage: r.case_stage,
      caseTypeName: r.case_type_name,
      interventionTypeName: r.intervention_type_name,
      description: r.description,
      status: r.status,
      decisionReason: r.decision_reason,
      requestedAt: r.requested_at,
      reviewedAt: r.reviewed_at,
      documents,
    });
  });

  router.patch('/intervention-requests/:requestId/decision', async (req, res) => {
    const { rows } = await pool.query(
      `select ir.request_id, ir.status, ir.user_id, ir.intervention_type_id, ir.description, u.jurisdiction_id,
              it.name as intervention_type_name
       from intervention_requests ir
       join users u on u.user_id = ir.user_id
       join intervention_types it on it.intervention_type_id = ir.intervention_type_id
       where ir.request_id = $1`,
      [req.params.requestId]
    );
    const target = rows[0];
    if (!target || !interventionTypeNames.includes(target.intervention_type_name)) return fail(res, 'Request not found', 404);
    if (jurisdictionScoped && target.jurisdiction_id !== getOwnJurisdictionId(req)) return fail(res, 'Request not found', 404);

    const { decision, reason } = req.body;
    if (!['Accepted', 'Rejected'].includes(decision)) return fail(res, "decision must be 'Accepted' or 'Rejected'", 400);
    if (decision === 'Rejected' && !(reason && String(reason).trim())) return fail(res, 'A reason is required to reject a request', 400);
    if (target.status !== 'Pending') return fail(res, 'This request has already been decided', 400);

    try {
      let updated;
      let newReferralId = null;

      if (decision === 'Accepted') {
        updated = await withTransaction(async (client) => {
          const { rows: ivRows } = await client.query(
            `insert into interventions (user_id, intervention_type_id, assigned_official_id, notes, recommended_at)
             values ($1, $2, $3, $4, now()) returning intervention_id`,
            [target.user_id, target.intervention_type_id, req.auth.officialId, target.description]
          );
          const { rows: reqRows } = await client.query(
            `update intervention_requests
             set status = 'Accepted', reviewed_by = $1, reviewed_at = now(), resulting_intervention_id = $2
             where request_id = $3
             returning request_id, status`,
            [req.auth.officialId, ivRows[0].intervention_id, target.request_id]
          );
          return reqRows[0];
        });

        // Separate, best-effort step - agency_referrals is always written
        // via the supabase client elsewhere in this codebase, never mixed
        // into a raw-pg transaction (matches dwo.routes.js's own
        // hand-off-rehabilitation convention). The proof has already been
        // genuinely verified and the accept has already committed above;
        // a failure here is logged and surfaced via newReferralId:null
        // rather than treated as if the accept itself failed.
        const { data: refRow, error: refError } = await supabase
          .from('agency_referrals')
          .insert({
            user_id: target.user_id,
            referred_to_role: roleName,
            referred_by_official_id: req.auth.officialId,
            reason: target.description || `${target.intervention_type_name} request accepted with verified proof.`,
            metadata: { interventionRequestId: target.request_id, interventionTypeName: target.intervention_type_name },
          })
          .select('referral_id')
          .single();
        if (refError) {
          console.error('intervention-requests decision: accepted but could not create agency_referral', refError.message, { requestId: target.request_id, roleName });
        } else {
          newReferralId = refRow.referral_id;
        }
      } else {
        const { rows: reqRows } = await pool.query(
          `update intervention_requests set status = 'Rejected', reviewed_by = $1, reviewed_at = now(), decision_reason = $2
           where request_id = $3 returning request_id, status`,
          [req.auth.officialId, String(reason).trim(), target.request_id]
        );
        updated = reqRows[0];
      }

      await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'intervention_request', entityId: target.request_id });

      return ok(res, { requestId: updated.request_id, status: updated.status, newReferralId }, `Request ${decision.toLowerCase()}`);
    } catch (err) {
      return fail(res, `Could not record decision: ${err.message}`, 500);
    }
  });
}

module.exports = { mountInterventionReviewRoutes };
