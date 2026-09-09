-- Document Transparency: the Investigating Officer uploads the FIR copy and
-- the filed Chargesheet as PDFs, and the victim can download them from their
-- own Case Details. Storage paths (not URLs) are held here - retrieval
-- always goes through a short-lived signed URL generated per request, the
-- same discipline intervention-proofs already follows, never a permanent
-- public link: a chargesheet/FIR is as sensitive as anything else in this
-- system.
--
-- Two dedicated columns rather than a jsonb array: unlike agency_referrals'
-- deliberately variable `metadata`, this shape is fixed and small (exactly
-- two document kinds), so it matches this table's own existing
-- chargesheet_status/chargesheet_filed_at column style.
alter table investigation_records add column if not exists fir_document_path text;
alter table investigation_records add column if not exists chargesheet_document_path text;

-- Private, exactly like intervention-proofs (see security_and_realtime.sql's
-- own comment on why nothing victim-related is ever a permanent public link).
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;
