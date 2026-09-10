const { pool } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');

// Shared by DLSA Coordinator and Legal Representative's own detail routes -
// both need the identical "resolve every document attached to a Legal Aid
// request, whichever of the three possible sources it came from, into a
// downloadable signed URL" logic, so it lives here once rather than being
// duplicated in both route files.
//
// A row's real storage location depends on its source (migration_040):
//   - 'uploaded' -> its own storage_path/storage_bucket columns
//   - linked to a prior intervention_request_documents row -> that row's own
//     storage_path, always in the 'intervention-proofs' bucket
//   - linked to investigation_records (FIR/chargesheet) -> the matching
//     column on that row (document_label tells us which), 'case-documents' bucket
async function loadRequestDocuments(requestId) {
  const { rows } = await pool.query(
    `select lrd.document_id, lrd.document_label, lrd.source, lrd.content_type, lrd.uploaded_at,
            coalesce(lrd.storage_path, ird.storage_path,
              case when lrd.document_label = 'FIR Copy' then inv.fir_document_path
                   when lrd.document_label = 'Chargesheet' then inv.chargesheet_document_path
              end
            ) as resolved_storage_path,
            coalesce(lrd.storage_bucket,
              case when lrd.linked_intervention_request_document_id is not null then 'intervention-proofs'
                   when lrd.linked_investigation_record_id is not null then 'case-documents'
              end
            ) as resolved_storage_bucket
     from legal_aid_request_documents lrd
     left join intervention_request_documents ird on ird.document_id = lrd.linked_intervention_request_document_id
     left join investigation_records inv on inv.investigation_id = lrd.linked_investigation_record_id
     where lrd.request_id = $1
     order by lrd.uploaded_at`,
    [requestId]
  );

  return Promise.all(rows.map(async (d) => {
    let signedUrl = null;
    if (d.resolved_storage_path && d.resolved_storage_bucket) {
      const { data, error } = await supabase.storage.from(d.resolved_storage_bucket).createSignedUrl(d.resolved_storage_path, 3600);
      signedUrl = error ? null : data.signedUrl;
    }
    return {
      documentId: d.document_id,
      documentLabel: d.document_label,
      source: d.source,
      contentType: d.content_type,
      uploadedAt: d.uploaded_at,
      signedUrl,
    };
  }));
}

module.exports = { loadRequestDocuments };
