-- Compensation is disbursed by DBT (Direct Benefit Transfer) into the
-- victim's own bank account - that is how PoA Act relief actually reaches a
-- person. Until now DWO could mark a payment stage "Paid" with no account
-- anywhere in the system to pay into, which made the whole Compensation
-- module unfinishable in practice.
--
-- Lives on user_identity, next to the other identity facts about the person
-- (name, contact, address, aadhaar) rather than on `users`, because a bank
-- account belongs to the PERSON, not to one docket - a victim with several
-- linked cases is paid into the same account for all of them.
--
-- Stored in plain columns, consistent with how aadhaar_number is already
-- held on this same table. Worth stating plainly: this is the existing
-- convention in this codebase, not a claim that it is sufficient protection
-- for production banking data - real disbursement would put this behind
-- column-level encryption or a payments provider's own vault.
alter table user_identity add column if not exists bank_account_name text;
alter table user_identity add column if not exists bank_account_number text;
alter table user_identity add column if not exists bank_ifsc text;
alter table user_identity add column if not exists bank_name text;
-- Storage path (never a URL) into the existing private 'intervention-proofs'
-- bucket - a passbook/cancelled-cheque scan is exactly the same class of
-- sensitive victim document that bucket already holds, so no new bucket.
alter table user_identity add column if not exists bank_proof_path text;
alter table user_identity add column if not exists bank_details_updated_at timestamptz;
