-- "Forward after review" - an EXISTING recipient of an already-submitted
-- report can forward it to someone else after reviewing it, without the
-- original sender regenerating the report. Two nullable columns on
-- report_recipients: both null for a recipient row created at ORIGINAL
-- generation time (POST .../reports/generate's primary/optional-cc rows),
-- both set for a row created via forwarding (POST .../reports/:reportId/forward) -
-- this is what lets the PDF's Submission & Review Trail and the plain
-- GET /reports list responses tell an original recipient apart from a
-- forwarded one, and show who forwarded it and when.

alter table report_recipients add column if not exists forwarded_by uuid references officials(official_id);
alter table report_recipients add column if not exists forwarded_at timestamptz;
